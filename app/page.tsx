"use client";

import utils from "./utils";
import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Output from "./components/Output";
import Toolbar from "./components/Toolbar";
import Menu from "./components/Menu";
import { useCompiler } from "./hooks/useCompiler";
import type { EditorHandle } from "./components/Editor";

const Editor = dynamic(() => import("./components/Editor"), { ssr: false });

type Status = "idle" | "compiling" | "running" | "done";

type TopBarProps = {
  share: () => void;
  run: () => void;
  ready: boolean;
  busy: boolean;
  status: Status;
  menuToggle: () => void;
};

function TopBar({ share, run, ready, busy, status, menuToggle }: TopBarProps) {
  const buttonDivClassNames =
    "flex items-center px-3 py-1 bg-[#252526] text-xs text-[#858585] font-mono";

  const buttonClass =
    "bg-[#292c33] hover:bg-[#3e3e3e] text-[#858585] font-semibold py-2 px-4 border border-gray-400 rounded shadow";

  return (
    <div className="flex px-3 py-1 bg-[#252526]">
      <div className={buttonDivClassNames}>
        <button title="menu toggle" onClick={menuToggle}>
          <img
            src="./menu_icon.png"
            alt="menu icon"
            width="24px"
            height="24px"
          />
        </button>
      </div>

      <div className={buttonDivClassNames}>
        <button onClick={run} disabled={!ready || busy} className={buttonClass}>
          {busy
            ? status === "compiling"
              ? "Compiling…"
              : "Running…"
            : "▶ Run"}
        </button>
      </div>

      <div className={buttonDivClassNames}>
        <button
          title="copy url with hashed file date to clipboard"
          className={buttonClass}
          onClick={share}
        >
          Share
        </button>
      </div>
    </div>
  );
}

export default function Home() {
  const editorRef = useRef<EditorHandle>(null);
  const [output, setOutput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [vimMode, setVimMode] = useState("NORMAL");
  const [split, setSplit] = useState(60); // left panel %
  const dragging = useRef(false);
  const [vimKeysState, setVimKeysState] = useState(true);
  const [canvasKey, setCanvasKey] = useState(0);
  const [canvasVisible, setCanvasVisible] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const { ready, compile, run } = useCompiler();
  const [isMobile, setIsMobile] = useState(false);
  const [menuToggle, setMenuToggle] = useState(false);
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);

  useEffect(() => {
    if (!currentFileName) return;
    const compressedSource = localStorage.getItem(`file-${currentFileName}`);
    if (!compressedSource) {
      return;
    }
    utils.decompressString(compressedSource).then((source) => {
      editorRef.current?.setValue(source);
    });
  }, [currentFileName]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");

    const update = () => setIsMobile(mq.matches);
    update();

    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  function handleStop() {
    abortRef.current?.abort();
  }

  async function handleRun() {
    const source = editorRef.current?.getValue() ?? "";
    setOutput("");
    setError(null);

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    let usedRaylib = false;

    try {
      setStatus("compiling");
      const wasmBytes = await compile(source);
      setStatus("running");
      const result = await run(
        wasmBytes,
        () => {
          usedRaylib = true;
          setCanvasVisible(true);
        },
        controller.signal,
      );
      if (result.error) {
        setError(result.error);
      } else {
        setOutput(result.output);
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setStatus("done");
      setCanvasVisible(false);
      if (usedRaylib) setCanvasKey((k) => k + 1);
    }
  }

  async function share() {
    const url = new URL(window.location.href);

    const source = editorRef.current?.getValue() ?? "";
    const cmp = await utils.compressString(source);
    url.hash = utils.base64Encode(cmp);

    await navigator.clipboard.write([
      new ClipboardItem({
        ["text/plain"]: url.toString(),
      }),
    ]);
  }

  useEffect(() => {
    const vks = localStorage.getItem("vimKeysState") ?? String(vimKeysState);
    setVimKeysState(vks === "true");
  }, []);

  useEffect(() => {
    localStorage.setItem("vimKeysState", String(vimKeysState));
  }, [vimKeysState]);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;

      const newSplit = (e.clientX / window.innerWidth) * 100;

      setSplit(Math.min(80, Math.max(20, newSplit)));
    }

    function onUp() {
      dragging.current = false;
    }

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const busy = status === "compiling" || status === "running";

  return (
    <>
      {canvasVisible && (
        <div
          style={{ zIndex: 9999 }}
          className="fixed inset-0 flex flex-col bg-black"
        >
          <div className="flex items-center justify-end px-2 py-1 bg-gray-900">
            <button
              onClick={handleStop}
              className="text-white text-sm font-semibold px-3 py-1 rounded hover:bg-white/20"
            >
              ✕ Stop
            </button>
          </div>
          <canvas key={canvasKey} id="canvas" className="flex-1 w-full" />
        </div>
      )}
      {menuToggle && !canvasVisible && (
        <Menu
          menuToggle={() => setMenuToggle(!menuToggle)}
          toggleVim={() => setVimKeysState(!vimKeysState)}
          vimKeysState={vimKeysState}
          setCurrentFileName={setCurrentFileName}
        />
      )}
      <div className="flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden">
        <div
          className={
            isMobile
              ? "flex flex-col h-screen bg-[#1e1e1e] text-white overflow-hidden"
              : "flex flex-1 min-h-0"
          }
        >
          <div
            {...(isMobile
              ? {
                  className:
                    "h-[70%] min-h-0 border-b border-[#3e3e3e] flex flex-col",
                }
              : {
                  className: "flex flex-col min-w-0 border-r border-[#3e3e3e]",
                  style: { width: `${split}%` },
                })}
          >
            <TopBar
              share={share}
              run={handleRun}
              ready={ready}
              busy={busy}
              status={status}
              menuToggle={() => setMenuToggle(!menuToggle)}
            />

            <div className="flex-1 min-h-0">
              <Editor
                handleRun={handleRun}
                vimKeysEnabled={vimKeysState}
                currentFileName={currentFileName}
                setCurrentFileName={setCurrentFileName}
                setVimMode={setVimMode}
                ref={editorRef}
              />
            </div>
          </div>

          {!isMobile && (
            <div
              className="w-1 cursor-col-resize bg-[#3e3e3e] hover:bg-blue-500 transition"
              onMouseDown={() => (dragging.current = true)}
            />
          )}

          <div
            {...(isMobile
              ? { className: "h-[30%] min-h-0" }
              : { className: "min-h-0", style: { width: `${100 - split}%` } })}
          >
            <Output output={output} error={error} status={status} />
          </div>
        </div>
        <Toolbar vimMode={vimMode} currentFileName={currentFileName} />
      </div>
    </>
  );
}
