"""Conservative UI Automation probe for a local, logged-in WeChat 4.x window.

No hooks, protocol access, account credentials, or network calls are used here.
This module must be tested on the user's Windows machine before sending.
"""
from __future__ import annotations

import ctypes
import io
import time
from collections import deque
from ctypes import wintypes as w

from runner_core import PilotError, title_matches, search_result_matches


def normalized_text(value):
    return str(value).replace("\r\n", "\n").replace("\r", "\n").replace("\u2029", "\n").replace("\u2028", "\n").rstrip("\n")


class WindowsAdapter:
    def __init__(self, owner_hwnd, stopped, log):
        import uiautomation as auto
        self.auto, self.stopped, self.log = auto, stopped, log
        auto.SetGlobalSearchTimeout(1)
        self.user = ctypes.WinDLL("user32", use_last_error=True)
        self.kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        for name, args, result in (
            ("GetForegroundWindow", [], w.HWND), ("SetForegroundWindow", [w.HWND], w.BOOL),
            ("ShowWindow", [w.HWND, ctypes.c_int], w.BOOL), ("GetWindow", [w.HWND, w.UINT], w.HWND),
            ("GetAsyncKeyState", [ctypes.c_int], ctypes.c_short),
            ("OpenClipboard", [w.HWND], w.BOOL), ("EmptyClipboard", [], w.BOOL),
            ("CloseClipboard", [], w.BOOL), ("SetClipboardData", [w.UINT, w.HANDLE], w.HANDLE),
        ):
            function = getattr(self.user, name)
            function.argtypes, function.restype = args, result
        for name, args, result in (
            ("GlobalAlloc", [w.UINT, ctypes.c_size_t], w.HGLOBAL),
            ("GlobalLock", [w.HGLOBAL], ctypes.c_void_p), ("GlobalUnlock", [w.HGLOBAL], w.BOOL),
            ("GlobalFree", [w.HGLOBAL], w.HGLOBAL),
        ):
            function = getattr(self.kernel, name)
            function.argtypes, function.restype = args, result
        self.owner = owner_hwnd
        roots = auto.GetRootControl().GetChildren()
        windows = [c for c in roots if self._attr(c, "ClassName") == "mmui::MainWindow"]
        if len(windows) != 1:
            classes = sorted({self._attr(c, "ClassName") for c in roots if "mmui" in self._attr(c, "ClassName").lower() or "wechat" in self._attr(c, "ClassName").lower()})
            raise PilotError("请先登录微信，只保留一个用于试跑的微信主窗口。若读取不到，请先开启讲述人，再重新打开微信。检测到的窗口类型：" + ", ".join(classes[:8]))
        self.main = windows[0]
        self.hwnd, self.pid = int(self.main.NativeWindowHandle), self.main.ProcessId
        self.scale = 1
        if hasattr(self.user, "GetDpiForWindow"):
            self.user.GetDpiForWindow.argtypes, self.user.GetDpiForWindow.restype = [w.HWND], w.UINT
            self.scale = max(1, self.user.GetDpiForWindow(self.hwnd) / 96)
        self.user.ShowWindow(self.hwnd, 9)
        self.user.SetForegroundWindow(self.hwnd)
        self._wait(lambda: self.user.GetForegroundWindow() == self.hwnd, "无法将微信切到前台，请先打开微信主窗口。")
        if self.main.BoundingRectangle.width() < 750 * self.scale:
            raise PilotError("请把微信主窗口放大或最大化后重试。")
        self.group = None
        self.requested_group = None

    @staticmethod
    def _attr(control, name, default=""):
        try:
            return getattr(control, name)
        except Exception:
            return default

    def _stop_check(self):
        if self.stopped() or self.user.GetAsyncKeyState(0x1B) & 0x8000:
            raise PilotError("已停止。如果微信留有草稿或图片预览，请手动取消；程序没有自动重发。")

    def _walk(self, root, max_depth=25, limit=2500):
        queue, result = deque([(root, 0)]), []
        while queue and len(result) < limit:
            self._stop_check()
            control, depth = queue.popleft()
            result.append(control)
            if depth < max_depth:
                try:
                    queue.extend((child, depth + 1) for child in control.GetChildren())
                except Exception:
                    continue
        return result

    def _wait(self, predicate, message, timeout=6):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            self._stop_check()
            value = predicate()
            if value:
                return value
            time.sleep(0.18)
        raise PilotError(message)

    def _visible(self, control):
        try:
            rectangle = control.BoundingRectangle
            return not control.IsOffscreen and rectangle.right > rectangle.left and rectangle.bottom > rectangle.top
        except Exception:
            return False

    def _foreground(self, hwnd=None):
        self._stop_check()
        if self.user.GetForegroundWindow() != (hwnd or self.hwnd):
            raise PilotError("微信焦点已改变，已停止。试跑时请暂时不要操作键鼠或切换窗口。")

    def _clipboard(self, format_id, content):
        handle = self.kernel.GlobalAlloc(0x0002, len(content))
        if not handle:
            raise PilotError("无法准备剪贴板内容。")
        transferred = opened = False
        try:
            pointer = self.kernel.GlobalLock(handle)
            if not pointer:
                raise PilotError("无法锁定剪贴板内存。")
            try:
                ctypes.memmove(pointer, content, len(content))
            finally:
                self.kernel.GlobalUnlock(handle)
            for _ in range(12):
                if self.user.OpenClipboard(self.owner):
                    opened = True
                    break
                time.sleep(0.08)
            if not opened or not self.user.EmptyClipboard() or not self.user.SetClipboardData(format_id, handle):
                raise PilotError("剪贴板正被占用，已停止；请稍后重试。")
            transferred = True
        finally:
            if opened:
                self.user.CloseClipboard()
            if not transferred:
                self.kernel.GlobalFree(handle)

    def _text(self, text):
        self._clipboard(13, text.replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-16-le") + b"\0\0")

    def _image(self, content):
        from PIL import Image
        with Image.open(io.BytesIO(content)) as image:
            buffer = io.BytesIO()
            image.convert("RGB").save(buffer, "BMP")
        self._clipboard(8, buffer.getvalue()[14:])

    def _value(self, editor):
        try:
            return str(editor.GetValuePattern().Value)
        except Exception:
            try:
                return str(editor.GetTextPattern().DocumentRange.GetText(-1))
            except Exception as error:
                raise PilotError("当前微信未提供可核对的输入框内容，已停止；请反馈检查报告。") from error

    def _focus_editor(self, editor):
        self._foreground()
        editor.Click()
        focus = self.auto.GetFocusedControl()
        left, top = editor.BoundingRectangle.left, editor.BoundingRectangle.top
        focused = focus.BoundingRectangle
        if self._attr(focus, "ControlTypeName") != "EditControl" or abs(focused.left - left) > 5 * self.scale or abs(focused.top - top) > 5 * self.scale:
            raise PilotError("无法核对输入焦点，已停止。")

    def _main_parts(self, group):
        nodes, rectangle = self._walk(self.main), self.main.BoundingRectangle
        threshold = rectangle.left + min(300 * self.scale, rectangle.width() * 0.3)
        headers = [c for c in nodes if self._visible(c) and self._attr(c, "ControlTypeName") == "TextControl" and title_matches(self._attr(c, "Name"), group) and c.BoundingRectangle.left > threshold and c.BoundingRectangle.top < rectangle.top + 140 * self.scale]
        editors = [c for c in nodes if self._visible(c) and self._attr(c, "ControlTypeName") == "EditControl" and c.BoundingRectangle.top > rectangle.top + rectangle.height() / 2 and c.BoundingRectangle.left > rectangle.left + 100 * self.scale]
        buttons = [c for c in nodes if self._visible(c) and self._attr(c, "ControlTypeName") == "ButtonControl" and self._attr(c, "Name") in ("发送", "发送(S)", "发送（S）", "Send") and c.BoundingRectangle.top > rectangle.top + rectangle.height() / 2]
        if not headers or len(editors) != 1 or len(buttons) != 1:
            raise PilotError("无法同时核对群标题、输入框和发送按钮。此微信版本尚未通过检查，已停止。")
        return editors[0], buttons[0]

    def open_group(self, group):
        self.requested_group = group
        self.user.SetForegroundWindow(self.hwnd)
        self._foreground()
        rectangle = self.main.BoundingRectangle
        search = [c for c in self._walk(self.main, 20) if self._visible(c) and self._attr(c, "ControlTypeName") == "EditControl" and self._attr(c, "Name") in ("搜索", "Search") and c.BoundingRectangle.top < rectangle.top + 200 * self.scale]
        if len(search) != 1:
            raise PilotError("没有找到唯一的微信搜索框。请先开启讲述人，再重新打开微信后重试。")
        search[0].Click()
        self._foreground()
        focus = self.auto.GetFocusedControl()
        if self._attr(focus, "Name") not in ("搜索", "Search"):
            raise PilotError("搜索框没有获得焦点，已停止。")
        self._text(group)
        self.auto.SendKeys("{Ctrl}a")
        self.auto.SendKeys("{Ctrl}v")
        time.sleep(0.7)

        def find_result():
            matches = {}
            roots = [c for c in self.auto.GetRootControl().GetChildren() if self._attr(c, "ProcessId", -1) == self.pid]
            for root in roots:
                for control in self._walk(root, 12, 1200):
                    if self._attr(control, "ControlTypeName") != "ListControl":
                        continue
                    for row in control.GetChildren():
                        if not self._visible(row) or "XTableCell" in self._attr(row, "ClassName"):
                            continue
                        if search_result_matches(self._attr(row, "Name"), group):
                            r = row.BoundingRectangle
                            matches[(r.left, r.top, r.right, r.bottom)] = row
            if len(matches) > 1:
                raise PilotError("找到多个同名结果，不能确定群聊，已停止。请核对完整群名。")
            return next(iter(matches.values()), None)

        result = self._wait(find_result, "未找到完全对应的群聊，已停止；不会选择相似群名。")
        result.Click()
        time.sleep(0.6)
        self.group = group
        self.assert_ready(group)

    def assert_ready(self, group):
        self._foreground()
        if self._owned_preview():
            raise PilotError("微信仍有弹窗，请先关闭设置、预览等弹窗后重试。")
        editor, _ = self._main_parts(group)
        if normalized_text(self._value(editor)).strip():
            raise PilotError("目标群输入框已有草稿，请先自行处理草稿后重试；程序不会覆盖。")

    def _owned_preview(self):
        previews = [c for c in self.auto.GetRootControl().GetChildren() if self._attr(c, "ProcessId", -1) == self.pid and self._attr(c, "NativeWindowHandle", 0) and int(c.NativeWindowHandle) != self.hwnd and self.user.GetWindow(int(c.NativeWindowHandle), 4) == self.hwnd and self._visible(c)]
        if len(previews) > 1:
            raise PilotError("微信出现多个弹窗，无法核对图片预览，已停止。")
        return previews[0] if previews else None

    def _image_target(self, group, editor):
        preview = self._owned_preview()
        if preview:
            self._main_parts(group)
            self._foreground(int(preview.NativeWindowHandle))
            buttons = [c for c in self._walk(preview, 20, 600) if self._visible(c) and self._attr(c, "ControlTypeName") == "ButtonControl" and self._attr(c, "Name") in ("发送", "发送(S)", "发送（S）", "Send")]
            if len(buttons) != 1:
                raise PilotError("图片预览中的发送按钮不唯一，已停止。")
            return preview, buttons[0]
        self._foreground()
        current, button = self._main_parts(group)
        images = [c for c in self._walk(current, 6, 100) if self._attr(c, "ControlTypeName") == "ImageControl"]
        if not images and "\ufffc" not in self._value(current):
            return None
        return None, button

    def _paste_image(self, group, content):
        self.assert_ready(group)
        editor, _ = self._main_parts(group)
        self._focus_editor(editor)
        self._image(content)
        self.auto.SendKeys("{Ctrl}v")
        time.sleep(0.4)
        return self._wait(lambda: self._image_target(group, editor), "无法核对图片粘贴结果，未点击发送；请手动取消预览并反馈检查报告。")

    def probe(self, store):
        # Exercise text and image composition, cancelling both without clicking Send.
        group, text = store.group, store.deliveries[0].content.decode("utf-8")
        editor, _ = self._main_parts(group)
        self._focus_editor(editor)
        self._text(text)
        self.auto.SendKeys("{Ctrl}v")
        self._wait(lambda: normalized_text(self._value(editor)) == normalized_text(text), "文字粘贴不能完整核对，未点击发送；请手动清除草稿后反馈。")
        self._foreground()
        self._focus_editor(editor)
        self.auto.SendKeys("{Ctrl}a{Delete}")
        self._wait(lambda: not normalized_text(self._value(editor)).strip(), "检查草稿未能清除，未点击发送。")
        preview, _ = self._paste_image(group, next(item.content for item in store.deliveries if item.kind == "image"))
        if preview:
            self._foreground(int(preview.NativeWindowHandle))
            self.auto.SendKeys("{Esc}")
            self._wait(lambda: self._owned_preview() is None, "图片预览未能取消，未点击发送，请手动取消。")
            self._wait(lambda: self.user.GetForegroundWindow() == self.hwnd, "图片预览取消后微信未回到前台，已停止。")
        else:
            self._focus_editor(editor)
            self.auto.SendKeys("{Ctrl}a{Delete}")
        self._wait(lambda: not normalized_text(self._value(self._main_parts(group)[0])).strip(), "图片草稿未能取消，未点击发送，请手动取消。")
        self.assert_ready(group)
        self.log("粘贴与取消检查通过：" + store.name + "（未点发送）")

    def submit(self, item):
        if item.kind == "text":
            self.assert_ready(item.group)
            editor, button = self._main_parts(item.group)
            self._focus_editor(editor)
            text = item.content.decode("utf-8")
            self._text(text)
            self.auto.SendKeys("{Ctrl}v")
            self._wait(lambda: normalized_text(self._value(editor)) == normalized_text(text), "文字粘贴不完整，未点击发送。")
            self._foreground()
            self._main_parts(item.group)
            button.Click()
        else:
            editor, _ = self._main_parts(item.group)
            preview, button = self._paste_image(item.group, item.content)
            self._foreground(int(preview.NativeWindowHandle) if preview else self.hwnd)
            self._main_parts(item.group)
            button.Click()
            self._wait(lambda: self._owned_preview() is None, "图片提交状态不明，已停止，不会自动重发。")
        self._wait(lambda: self.user.GetForegroundWindow() == self.hwnd, "提交后微信焦点不明，已停止。")
        self._wait(lambda: not normalized_text(self._value(self._main_parts(item.group)[0])).strip(), "提交后输入框未清空，状态不明，已停止。")
        time.sleep(1)

    def report(self):
        # No chat history, account identifiers, or draft text is written to the report.
        counts, candidates = {}, []
        rectangle = self.main.BoundingRectangle
        for control in self._walk(self.main, 24, 1600):
            key = self._attr(control, "ControlTypeName") + " / " + self._attr(control, "ClassName")
            counts[key] = counts.get(key, 0) + 1
            if not self._visible(control):
                continue
            kind, r = self._attr(control, "ControlTypeName"), control.BoundingRectangle
            if len(candidates) < 120 and (kind in ("EditControl", "ButtonControl", "ToolBarControl", "ListItemControl") or kind == "TextControl" and r.top < rectangle.top + 160 * self.scale or kind in ("CustomControl", "DocumentControl") and r.top > rectangle.top + rectangle.height() / 2):
                name = self._attr(control, "Name")
                label = name if name in ("搜索", "Search", "发送", "发送(S)", "发送（S）", "Send", "聊天", "Chats") else "目标群名称" if self.requested_group and (title_matches(name, self.requested_group) or search_result_matches(name, self.requested_group)) else "<名称已省略>"
                candidates.append({"type": kind, "class": self._attr(control, "ClassName"), "label": label, "rect": [r.left-rectangle.left, r.top-rectangle.top, r.right-r.left, r.bottom-r.top]})
        return {"window_class": self.main.ClassName, "dpi_scale": self.scale, "control_counts": counts, "candidate_controls": candidates}
