import argparse
import os
import platform
import signal
import socket
import subprocess
import sys
import time


def is_port_in_use(host: str, port: int) -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.settimeout(0.5)
        return sock.connect_ex((host, port)) == 0


def _pids_on_port_windows(port: int) -> list[int]:
    cmd = ["netstat", "-ano"]
    proc = subprocess.run(cmd, capture_output=True, text=True, check=True)

    pids = set()
    needle = f":{port}"
    for line in proc.stdout.splitlines():
        if needle not in line:
            continue

        parts = line.split()
        if len(parts) < 5:
            continue

        local_addr = parts[1]
        state = parts[3]
        pid = parts[4]

        if local_addr.endswith(needle) and state.upper() == "LISTENING" and pid.isdigit():
            pids.add(int(pid))

    return sorted(pids)


def _kill_pid_windows(pid: int) -> None:
    subprocess.run(["taskkill", "/PID", str(pid), "/F"], check=True, capture_output=True, text=True)


def free_port(host: str, port: int) -> None:
    if not is_port_in_use(host, port):
        return

    system = platform.system().lower()
    if system == "windows":
        pids = _pids_on_port_windows(port)
        if not pids:
            raise RuntimeError(f"Port {port} is in use but no listening PID could be resolved")

        current_pid = os.getpid()
        for pid in pids:
            if pid == current_pid:
                continue
            _kill_pid_windows(pid)

        time.sleep(0.5)
        if is_port_in_use(host, port):
            raise RuntimeError(f"Port {port} is still in use after attempting to free it")
        return

    # Best-effort fallback for non-Windows systems.
    subprocess.run(["fuser", "-k", f"{port}/tcp"], check=False)
    time.sleep(0.5)
    if is_port_in_use(host, port):
        raise RuntimeError(f"Port {port} is still in use after attempting to free it")


def main() -> None:
    parser = argparse.ArgumentParser(description="Start Hypercorn after freeing an occupied port")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--no-reload", dest="reload", action="store_false")
    parser.set_defaults(reload=True)
    args = parser.parse_args()

    free_port(args.host, args.port)

    cmd = [
        sys.executable,
        "-m",
        "hypercorn",
        "api.app:app",
        "--bind",
        f"{args.host}:{args.port}",
    ]
    if args.reload:
        cmd.append("--reload")

    print(f"Starting Hypercorn on http://{args.host}:{args.port}")
    subprocess.Popen(cmd)
    return


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"Startup failed: {exc}")
        sys.exit(1)
