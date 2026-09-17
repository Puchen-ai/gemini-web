import os, sys, subprocess

def daemonize():
    try:
        pid = os.fork()
        if pid > 0:
            sys.exit(0)
    except OSError as e:
        sys.exit(1)

    os.setsid()
    os.umask(0)

    try:
        pid = os.fork()
        if pid > 0:
            sys.exit(0)
    except OSError as e:
        sys.exit(1)

    sys.stdout.flush()
    sys.stderr.flush()

    with open("/root/agy-web/server.log", "a") as log:
        p = subprocess.Popen(
            ["node", "/root/agy-web/server.js"],
            cwd="/root/agy-web",
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=log,
            close_fds=True
        )
        print(f"Daemonized process started with PID: {p.pid}")

if __name__ == "__main__":
    daemonize()
