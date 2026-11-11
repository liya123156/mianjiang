"""First-run Windows UI. Selecting a ZIP never sends messages."""
from __future__ import annotations

import json
import os
import queue
import sys
import threading
from datetime import datetime
from pathlib import Path
import tkinter as tk
from tkinter import ttk, filedialog, messagebox

from runner_core import Journal, PilotError, load_bundle, preflight, submit

STATE = Path(os.environ.get("LOCALAPPDATA", str(Path.home()))) / "LiyaMeetingPilot"
STATE.mkdir(parents=True, exist_ok=True)


class App:
    def __init__(self, root):
        self.root, self.bundle, self.ready, self.busy = root, None, False, False
        self.messages, self.stop_event = queue.Queue(), threading.Event()
        root.title("业主面见 · 两店微信试跑 0.1")
        root.geometry("990x750")
        root.configure(bg="#fbf7ff")
        style = ttk.Style(root)
        style.theme_use("clam")
        style.configure("TFrame", background="#fbf7ff")
        style.configure("TLabel", background="#fbf7ff", foreground="#513364", font=("Microsoft YaHei", 11))
        style.configure("TButton", font=("Microsoft YaHei", 11), padding=9)
        host = ttk.Frame(root, padding=20)
        host.pack(fill="both", expand=True)
        ttk.Label(host, text="先检查，再由你启动两店试发", font=("Microsoft YaHei", 19, "bold")).pack(anchor="w")
        ttk.Label(host, text="首次试跑版：尚未在你的微信4.1.15.56上验证。检查不通过时不会点发送。").pack(anchor="w", pady=8)
        ttk.Label(host, text="检查会临时粘贴文字、打开图片预览并取消；请保持微信登录、窗口放大，暂时不要操作键鼠。按Esc可中止。", wraplength=930).pack(anchor="w")
        self.status = tk.StringVar(value="请选择工作台生成的“两店试行资料包.zip”。")
        buttons = ttk.Frame(host)
        buttons.pack(fill="x", pady=14)
        self.pick_button = ttk.Button(buttons, text="1 选择两店资料包", command=self.pick)
        self.pick_button.pack(side="left", padx=(0, 8))
        self.check_button = ttk.Button(buttons, text="2 仅检查（不点发送）", state="disabled", command=lambda: self.start(False))
        self.check_button.pack(side="left", padx=8)
        self.send_button = ttk.Button(buttons, text="3 开始两店试发", state="disabled", command=lambda: self.start(True))
        self.send_button.pack(side="left", padx=8)
        ttk.Button(buttons, text="停止", command=self.stop_event.set).pack(side="right")
        ttk.Label(host, textvariable=self.status, wraplength=930).pack(anchor="w", pady=(0, 10))
        self.table = ttk.Treeview(host, columns=("store", "group", "count"), show="headings", height=3)
        for name, label, width in (("store", "门店", 150), ("group", "将操作的经理群完整名称", 580), ("count", "发送内容", 170)):
            self.table.heading(name, text=label)
            self.table.column(name, width=width)
        self.table.pack(fill="x")
        self.table.bind("<<TreeviewSelect>>", self.preview)
        ttk.Label(host, text="话术预览（选择上方门店切换；每店图片数量已列出）").pack(anchor="w", pady=(12, 4))
        self.text = tk.Text(host, height=9, wrap="word", font=("Microsoft YaHei", 10))
        self.text.pack(fill="both", expand=True)
        self.text.configure(state="disabled")
        ttk.Label(host, text="执行记录：显示“已提交”仍需在微信中核对，程序不把点击发送等同于已送达。").pack(anchor="w", pady=(10, 3))
        self.log = tk.Text(host, height=7, wrap="word", font=("Microsoft YaHei", 10))
        self.log.pack(fill="both", expand=True)
        ttk.Button(host, text="打开检查报告和发送记录文件夹", command=lambda: os.startfile(STATE)).pack(anchor="w", pady=(10, 0))
        root.after(100, self.poll)
        root.protocol("WM_DELETE_WINDOW", self.close)

    def pick(self):
        path = filedialog.askopenfilename(title="选择工作台“两店试行资料包”", filetypes=[("ZIP资料包", "*.zip")])
        if not path:
            return
        try:
            bundle = load_bundle(path)
            Journal(STATE).check(bundle)
        except Exception as error:
            messagebox.showerror("资料包未通过检查", str(error))
            return
        self.bundle, self.ready = bundle, False
        self.table.delete(*self.table.get_children())
        for index, store in enumerate(bundle.stores):
            self.table.insert("", "end", iid=str(index), values=(store.name, store.group, "1条文字＋" + str(len(store.deliveries)-1) + "张图片"))
        self.table.selection_set("0")
        self.preview()
        self.status.set("数据截至 " + bundle.as_of + "；共2家门店。请先核对完整群名和话术，再点击“仅检查”。")
        self.check_button.configure(state="normal")
        self.send_button.configure(state="disabled")

    def preview(self, _event=None):
        selected = self.table.selection()
        if not self.bundle or not selected:
            return
        self.text.configure(state="normal")
        self.text.delete("1.0", "end")
        self.text.insert("end", self.bundle.stores[int(selected[0])].deliveries[0].content.decode("utf-8"))
        self.text.configure(state="disabled")

    def start(self, sending):
        if self.busy or not self.bundle or sending and not self.ready:
            return
        self.busy, self.ready = True, False
        self.stop_event.clear()
        for button in (self.pick_button, self.check_button, self.send_button):
            button.configure(state="disabled")
        self.status.set("正在试发，请暂时不要操作键鼠。按Esc或点击停止可中止。" if sending else "正在检查：只粘贴并取消草稿，不点发送。")
        bundle, owner_hwnd = self.bundle, self.root.winfo_id()

        def worker():
            adapter, report = None, {"at": datetime.now().isoformat(), "mode": "submit" if sending else "preflight", "as_of": bundle.as_of, "stores": [{"store": s.name, "group": s.group} for s in bundle.stores]}
            emit = lambda value: self.messages.put(("log", value))
            try:
                import uiautomation as auto
                from windows_adapter import WindowsAdapter
                with auto.UIAutomationInitializerInThread():
                    try:
                        adapter = WindowsAdapter(owner_hwnd, self.stop_event.is_set, emit)
                        if sending:
                            count = submit(bundle, adapter, Journal(STATE), emit, self.stop_event.is_set)
                            report["result"] = "submitted-needs-manual-check"
                            self.messages.put(("sent", str(count)))
                        else:
                            preflight(bundle, adapter, emit, self.stop_event.is_set)
                            report["result"] = "preflight-passed-no-send"
                            self.messages.put(("checked", "两群文字、图片粘贴与取消均通过；未点发送。"))
                    finally:
                        if adapter and not self.stop_event.is_set():
                            try:
                                report["interface"] = adapter.report()
                            except Exception:
                                pass
            except Exception as error:
                message = str(error) if isinstance(error, PilotError) else "读取或提交发生异常：" + type(error).__name__ + "。请保留检查报告并反馈。"
                report.update(result="stopped", error=message)
                self.messages.put(("error", message))
            finally:
                (STATE / "latest-check.json").write_text(json.dumps(report, ensure_ascii=False, indent=2), "utf-8")
                self.messages.put(("done", ""))

        threading.Thread(target=worker, daemon=True).start()

    def poll(self):
        try:
            while True:
                kind, value = self.messages.get_nowait()
                if kind == "log":
                    self.log.insert("end", datetime.now().strftime("%H:%M:%S ") + value + "\n")
                    self.log.see("end")
                elif kind == "checked":
                    self.ready = True
                    self.status.set(value + "你可以核对后点击“开始两店试发”。")
                elif kind == "sent":
                    self.status.set("共提交 " + value + " 项。请到两个微信群核对文字、图片和顺序；不会自动重发。")
                elif kind == "error":
                    self.status.set("已停止：" + value)
                    self.log.insert("end", "已停止：" + value + "\n")
                    self.ready = False
                elif kind == "done":
                    self.busy = False
                    self.pick_button.configure(state="normal")
                    self.check_button.configure(state="normal")
                    self.send_button.configure(state="normal" if self.ready else "disabled")
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def close(self):
        self.stop_event.set()
        self.root.destroy()


def main():
    if os.name != "nt":
        raise SystemExit("此程序仅在你自己的Windows办公电脑运行。")
    import msvcrt
    lock = (STATE / "app.lock").open("a+b")
    if not (STATE / "app.lock").stat().st_size:
        lock.write(b"0")
        lock.flush()
    lock.seek(0)
    try:
        msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
    except OSError:
        messagebox.showinfo("两店试跑", "已有一个试跑程序在运行，请先关闭已有窗口。")
        lock.close()
        return
    root = tk.Tk()
    App(root)
    root.mainloop()
    lock.close()


if __name__ == "__main__":
    main()
