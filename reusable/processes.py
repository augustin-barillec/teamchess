import os
import signal
import subprocess


def list_processes(contains):
    out = subprocess.check_output(["ps", "-aef"], universal_newlines=True)
    lines = out.splitlines()[1:]
    if contains is not None:
        lines = [line for line in lines if contains in line]
    return lines


def kill_processes(contains):
    lines = list_processes(contains=contains)
    for line in lines:
        pid = int(line.split(None, 2)[1])
        os.kill(pid, signal.SIGKILL)
        print(f"KILLED: {line}")
