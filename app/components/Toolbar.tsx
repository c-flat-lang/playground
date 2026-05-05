"use client";

interface ToolbarProps {
  onStop: () => void;
  vimMode: string;
}

export default function Toolbar({ onStop, vimMode }: ToolbarProps) {
  return (
    <div className="flex items-center justify-between px-3 h-8 bg-[#3c3836] text-white text-xs font-mono select-none shrink-0 relative z-[100]">
      {/* Left: vim mode */}
      <span className="w-24 text-yellow-200 font-bold uppercase tracking-wider">
        {vimMode || "NORMAL"}
      </span>

      {/* Center: title */}
      <span className="text-white/80">C-Flat Playground</span>
      <div></div>

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
