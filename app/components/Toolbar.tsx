"use client";

interface ToolbarProps {
  vimMode: string;
  currentFileName: string | null;
}

export default function Toolbar({ vimMode, currentFileName }: ToolbarProps) {
  return (
    <div className="flex px-3 h-8 bg-[#3c3836] text-white text-xs font-mono select-none shrink-0 relative z-[100]">
      {/* Left: vim mode */}
      <span className="w-24 text-yellow-200 font-bold uppercase tracking-wider">
        {vimMode || "NORMAL"}
      </span>

      {/* Center: title */}
      <div>{currentFileName ? currentFileName : "[No Name]"}</div>

      {/* Right: run / stop buttons */}
      {/* <div className="flex gap-2"> */}
      {/*   {status === "running" && ( */}
      {/*     <button */}
      {/*       onClick={onStop} */}
      {/*       className="px-3 py-0.5 rounded bg-red-600/80 hover:bg-red-500 transition-colors text-white font-semibold" */}
      {/*     > */}
      {/*       ■ Stop */}
      {/*     </button> */}
      {/*   )} */}
      {/*   <button */}
      {/*     onClick={onRun} */}
      {/*     disabled={!ready || busy} */}
      {/*     className="px-3 py-0.5 rounded bg-white/20 hover:bg-white/30 disabled:opacity-40 disabled:cursor-not-allowed transition-colors text-white font-semibold" */}
      {/*   > */}
      {/*     {busy */}
      {/*       ? status === "compiling" */}
      {/*         ? "Compiling…" */}
      {/*         : "Running…" */}
      {/*       : "▶ Run"} */}
      {/*   </button> */}
      {/* </div> */}
    </div>
  );
}
