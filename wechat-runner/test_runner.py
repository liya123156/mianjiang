import copy
import io
import json
import tempfile
import unittest
import zipfile
from datetime import date
from pathlib import Path

from PIL import Image
from runner_core import Journal, PilotError, load_bundle, preflight, submit, title_matches, search_result_matches


class FakeAdapter:
    def __init__(self, bad_group=None, fail_at=None):
        self.events, self.bad_group, self.fail_at, self.count = [], bad_group, fail_at, 0

    def open_group(self, group):
        self.events.append(("open", group))
        if group == self.bad_group:
            raise PilotError("群名不能核对")

    def assert_ready(self, group):
        self.events.append(("ready", group))

    def probe(self, store):
        self.events.append(("probe-without-send", store.group))

    def submit(self, item):
        self.count += 1
        self.events.append(("submit", item.group, item.kind))
        if self.count == self.fail_at:
            raise PilotError("提交状态不明")


class RunnerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name)
        self.files = {}
        self.manifest = {"schemaVersion": 1, "status": "prepared", "pilot": True, "operatorRole": "project", "recipientsComplete": True, "month": "2026-11", "asOf": "2026-11-08", "sourceVersion": "fixture", "stores": []}
        for index, store in enumerate(("复兴香园店", "新天地二店")):
            prefix = str(index + 1) + "_" + store
            names = [prefix + "/01.png", prefix + "/02.png", prefix + "/03.png"]
            for image_index, name in enumerate(names):
                output = io.BytesIO()
                Image.new("RGB", (20, 20), (index * 80, image_index * 80, 180)).save(output, "PNG")
                self.files[name] = output.getvalue()
            message = prefix + "/话术.txt"
            self.files[message] = (store + "\n面见测试\n图片对应本店🏆").encode()
            self.manifest["stores"].append({"store": store, "groupName": "🏆测试群" + str(index), "message": message, "images": names, "modules": dict(zip(("progress", "details", "quality"), ([name] for name in names)))})

    def write(self, manifest=None, files=None):
        path = self.path / "bundle.zip"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("manifest.json", json.dumps(manifest or self.manifest, ensure_ascii=False))
            for name, content in (self.files if files is None else files).items():
                archive.writestr(name, content)
        return path

    def bundle(self):
        return load_bundle(self.write(), date(2026, 11, 11))

    def test_exact_names_and_three_modules(self):
        bundle = self.bundle()
        self.assertEqual(len(bundle.stores), 2)
        self.assertEqual(bundle.stores[0].group, "🏆测试群0")
        self.assertEqual([item.kind for item in bundle.stores[0].deliveries], ["text", "image", "image", "image"])
        self.assertTrue(title_matches("🏆测试群0(28)", "🏆测试群0"))
        self.assertFalse(title_matches("🏆测试群0项目群", "🏆测试群0"))
        self.assertFalse(title_matches("测试群0", "🏆测试群0"))
        self.assertTrue(search_result_matches("🏆测试群0\n群聊", "🏆测试群0"))
        self.assertFalse(search_result_matches("🏆测试群0(28)", "🏆测试群0"))
        self.assertFalse(search_result_matches("其他群\n🏆测试群0", "🏆测试群0"))

    def test_only_pilot_owner_complete_recipients(self):
        for key, value in (("pilot", False), ("operatorRole", "store"), ("recipientsComplete", False)):
            manifest = copy.deepcopy(self.manifest)
            manifest[key] = value
            with self.assertRaises(PilotError):
                load_bundle(self.write(manifest), date(2026, 11, 11))

    def test_cross_store_image_is_rejected(self):
        manifest = copy.deepcopy(self.manifest)
        changed = manifest["stores"][1]["images"][0]
        manifest["stores"][0]["images"][0] = changed
        manifest["stores"][0]["modules"]["progress"][0] = changed
        with self.assertRaises(PilotError):
            load_bundle(self.write(manifest), date(2026, 11, 11))

    def test_paths_and_groups_are_rejected(self):
        files = dict(self.files, **{"../outside.txt": b"bad"})
        with self.assertRaises(PilotError):
            load_bundle(self.write(files=files), date(2026, 11, 11))
        manifest = copy.deepcopy(self.manifest)
        manifest["stores"][1]["groupName"] = manifest["stores"][0]["groupName"]
        with self.assertRaises(PilotError):
            load_bundle(self.write(manifest), date(2026, 11, 11))

    def test_all_pages_retained(self):
        manifest = copy.deepcopy(self.manifest)
        row = manifest["stores"][0]
        extra = row["images"][1].replace("02.png", "02_page2.png")
        output = io.BytesIO()
        Image.new("RGB", (10, 10), (255, 0, 10)).save(output, "PNG")
        self.files[extra] = output.getvalue()
        row["images"].insert(2, extra)
        row["modules"]["details"].append(extra)
        bundle = load_bundle(self.write(manifest), date(2026, 11, 11))
        self.assertEqual(len(bundle.stores[0].deliveries), 5)

    def test_preflight_does_not_send_and_checks_both(self):
        adapter = FakeAdapter()
        preflight(self.bundle(), adapter, lambda _: None, lambda: False)
        self.assertEqual(adapter.count, 0)
        self.assertEqual(sum(event[0] == "probe-without-send" for event in adapter.events), 2)

    def test_second_group_failure_blocks_all_messages(self):
        bundle = self.bundle()
        adapter, journal = FakeAdapter(bad_group=bundle.stores[1].group), Journal(self.path / "state")
        with self.assertRaises(PilotError):
            submit(bundle, adapter, journal, lambda _: None, lambda: False)
        self.assertEqual(adapter.count, 0)
        self.assertEqual(journal.records, {})

    def test_order_and_duplicate_protection(self):
        bundle, adapter, journal = self.bundle(), FakeAdapter(), Journal(self.path / "state")
        self.assertEqual(submit(bundle, adapter, journal, lambda _: None, lambda: False), 8)
        actual = [event for event in adapter.events if event[0] == "submit"]
        self.assertEqual(actual, [("submit", store.group, item.kind) for store in bundle.stores for item in store.deliveries])
        self.assertEqual({record["state"] for record in journal.records.values()}, {"submitted"})
        with self.assertRaises(PilotError):
            submit(bundle, adapter, Journal(self.path / "state"), lambda _: None, lambda: False)

    def test_unknown_submission_is_not_retried(self):
        bundle, adapter, journal = self.bundle(), FakeAdapter(fail_at=2), Journal(self.path / "state")
        with self.assertRaises(PilotError):
            submit(bundle, adapter, journal, lambda _: None, lambda: False)
        self.assertEqual(adapter.count, 2)
        self.assertEqual([record["state"] for record in journal.records.values()], ["submitted", "unknown"])
        with self.assertRaises(PilotError):
            journal.check(bundle)

    def test_stop_between_items(self):
        bundle, adapter, journal = self.bundle(), FakeAdapter(), Journal(self.path / "state")
        with self.assertRaises(PilotError):
            submit(bundle, adapter, journal, lambda _: None, lambda: adapter.count == 1)
        self.assertEqual(adapter.count, 1)

    def test_corrupt_journal_blocks_sending(self):
        state = self.path / "state"
        state.mkdir()
        (state / "journal.json").write_text("damaged", "utf-8")
        with self.assertRaises(PilotError):
            Journal(state)


if __name__ == "__main__":
    unittest.main()
