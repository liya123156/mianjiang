"""Offline pilot bundle validation and a no-automatic-retry sending journal."""
from __future__ import annotations

import hashlib
import io
import json
import os
import re
import zipfile
from dataclasses import dataclass
from datetime import date, datetime, timezone, timedelta
from pathlib import Path, PurePosixPath

PILOT_STORES = frozenset(("复兴香园店", "新天地二店"))
MAX_BYTES = 50 * 1024 * 1024


class PilotError(RuntimeError):
    pass


def title_matches(actual: str, expected: str) -> bool:
    # Only the client's optional member count may follow the exact group name.
    return actual == expected or bool(re.fullmatch(re.escape(expected) + r"\s*[（(]\d+[）)]", actual))


def search_result_matches(actual: str, expected: str) -> bool:
    # A count-like suffix may be part of a different group's literal name.
    # Require the result's own leading name, never a matching chat excerpt.
    lines = str(actual).splitlines()
    return bool(lines) and lines[0].strip() == expected


def _safe_path(name: str) -> bool:
    if not isinstance(name, str) or not name or "\\" in name or ":" in name or re.search(r"[\x00-\x1f]", name):
        return False
    path = PurePosixPath(name)
    return not path.is_absolute() and all(part not in (".", "..", "") and not part.endswith((".", " ")) for part in name.split("/"))


@dataclass(frozen=True)
class Delivery:
    store: str
    group: str
    kind: str
    name: str
    content: bytes
    key: str


@dataclass(frozen=True)
class Store:
    name: str
    group: str
    deliveries: tuple[Delivery, ...]


@dataclass(frozen=True)
class Bundle:
    month: str
    as_of: str
    stores: tuple[Store, ...]
    fingerprint: str


def load_bundle(filename: str | Path, today: date | None = None) -> Bundle:
    today = today or datetime.now(timezone(timedelta(hours=8))).date()
    try:
        with zipfile.ZipFile(filename) as archive:
            files = archive.infolist()
            names = [file.filename for file in files]
            if len(files) > 400 or sum(file.file_size for file in files) > MAX_BYTES or any(file.flag_bits & 1 for file in files):
                raise PilotError("资料包过大或已加密，请重新从工作台生成两店试行资料包。")
            if any(not _safe_path(name) for name in names) or len({name.casefold() for name in names}) != len(names):
                raise PilotError("资料包路径无效或重复，请重新生成。")
            manifest = json.loads(archive.read("manifest.json").decode("utf-8-sig"))
            if manifest.get("schemaVersion") != 1 or manifest.get("status") != "prepared" or manifest.get("pilot") is not True or manifest.get("operatorRole") != "project" or manifest.get("recipientsComplete") is not True:
                raise PilotError("请选择项目负责人最新生成的“两店试行资料包”，不是18店资料包。")
            as_of = date.fromisoformat(manifest["asOf"])
            if as_of > today or manifest["month"] != as_of.strftime("%Y-%m"):
                raise PilotError("数据截止日期无效或属于未来，请核对底表。")
            rows = manifest["stores"]
            if not isinstance(rows, list) or len(rows) != 2 or {row["store"] for row in rows} != PILOT_STORES:
                raise PilotError("此版本仅试行复兴香园店、新天地二店，不会处理其他门店。")
            stores, seen_groups, used_files = [], set(), set()
            from PIL import Image
            Image.MAX_IMAGE_PIXELS = 50_000_000
            for row in rows:
                group = row.get("groupName")
                if not isinstance(group, str) or not group or group != group.strip() or re.search(r"[\x00-\x1f]", group) or group in seen_groups:
                    raise PilotError("完整群名缺失、重复或格式异常，请在项目配置中核对。")
                seen_groups.add(group)
                message, images, modules = row["message"], row["images"], row["modules"]
                if not isinstance(images, list) or not images or len(images) > 100 or set(modules) != {"progress", "details", "quality"}:
                    raise PilotError("资料包缺少三个图片模块。")
                ordered = [*modules["progress"], *modules["details"], *modules["quality"]]
                if any(not modules[k] for k in modules) or ordered != images or len(set(images)) != len(images):
                    raise PilotError("图片模块顺序不一致或重复，请重新生成。")
                folder = PurePosixPath(message).parts[0]
                if not folder.endswith("_" + row["store"]):
                    raise PilotError("门店与资料文件夹不一致，已停止。")
                content_items = []
                for name in [message, *images]:
                    if not _safe_path(name) or PurePosixPath(name).parts[0] != folder or name in used_files:
                        raise PilotError("检测到门店资料交叉引用，已停止。")
                    used_files.add(name)
                    content = archive.read(name)  # zipfile also verifies the entry's CRC.
                    if name == message:
                        text = content.decode("utf-8-sig")
                        if not text.strip() or len(text) > 20000:
                            raise PilotError("话术为空或过长。")
                        content, kind = text.encode("utf-8"), "text"
                    else:
                        with Image.open(io.BytesIO(content)) as image:
                            if image.format != "PNG" or image.width * image.height > Image.MAX_IMAGE_PIXELS:
                                raise PilotError("仅支持工作台生成的PNG图片。")
                            image.verify()
                        kind = "image"
                    seed = "\0".join((manifest["month"], manifest["asOf"], str(manifest["sourceVersion"]), row["store"], group, kind)).encode("utf-8")
                    key = hashlib.sha256(seed + b"\0" + content).hexdigest()
                    if any(item.key == key for item in content_items):
                        raise PilotError("同一门店存在重复图片内容，请核对资料包。")
                    content_items.append(Delivery(row["store"], group, kind, name, content, key))
                stores.append(Store(row["store"], group, tuple(content_items)))
            fingerprint = hashlib.sha256("|".join(item.key for store in stores for item in store.deliveries).encode()).hexdigest()
            return Bundle(manifest["month"], manifest["asOf"], tuple(stores), fingerprint)
    except PilotError:
        raise
    except Exception as error:
        raise PilotError("无法读取资料包，请重新生成并下载：" + type(error).__name__) from error


class Journal:
    def __init__(self, directory: Path):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True)
        self.path = self.directory / "journal.json"
        try:
            self.records = json.loads(self.path.read_text("utf-8")) if self.path.exists() else {}
            if not isinstance(self.records, dict):
                raise ValueError("invalid journal")
        except Exception as error:
            raise PilotError("发送记录无法读取，为避免重复提交已停止。请保留state目录并反馈。") from error

    def check(self, bundle: Bundle):
        if any(item.key in self.records for store in bundle.stores for item in store.deliveries):
            raise PilotError("这批资料已有提交或中断记录，不会自动重发。请先核对微信和发送记录。")

    def mark(self, item: Delivery, state: str):
        self.records[item.key] = {"store": item.store, "group": item.group, "kind": item.kind, "state": state, "at": datetime.now(timezone.utc).isoformat()}
        temporary = self.path.with_suffix(".tmp")
        with temporary.open("w", encoding="utf-8") as handle:
            json.dump(self.records, handle, ensure_ascii=False, indent=2)
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, self.path)


def preflight(bundle: Bundle, adapter, log, stopped):
    for store in bundle.stores:
        if stopped():
            raise PilotError("已停止检查。")
        adapter.open_group(store.group)
        adapter.assert_ready(store.group)
        adapter.probe(store)
        log("群名检查通过：" + store.name + " → " + store.group)


def submit(bundle: Bundle, adapter, journal: Journal, log, stopped):
    journal.check(bundle)
    # Check both recipients before any message is submitted.
    preflight(bundle, adapter, log, stopped)
    total = 0
    for store in bundle.stores:
        adapter.open_group(store.group)
        for item in store.deliveries:
            if stopped():
                raise PilotError("已停止；已提交的项目不会自动重发。")
            adapter.assert_ready(store.group)
            journal.mark(item, "started")  # Persist before every potential side effect.
            try:
                adapter.submit(item)
            except Exception:
                journal.mark(item, "unknown")
                raise
            journal.mark(item, "submitted")
            total += 1
            log("已提交待核对：" + store.name + " · " + ("话术" if item.kind == "text" else PurePosixPath(item.name).name))
    return total
