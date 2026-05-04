"use client";

import { useEffect, useRef, useState } from "react";

interface RunResult {
  output: string;
  error: string | null;
}

class RaylibDetected extends Error {}

type AsyncifyState = "normal" | "unwinding" | "rewinding";

// Read a null-terminated C string from user WASM memory.
function readCString(mem: Uint8Array, ptr: number): string {
  let end = ptr;
  while (end < mem.length && mem[end] !== 0) end++;
  return new TextDecoder().decode(mem.subarray(ptr, end));
}

export function useCompiler() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = useRef<any>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    async function load() {
      const m = await import("../../lib/cflat/cflat.js");
      await m.default();
      mod.current = m;
      setReady(true);
    }
    load().catch(console.error);
  }, []);

  async function compile(source: string): Promise<Uint8Array> {
    if (!mod.current) throw new Error("Compiler not loaded");
    const { compile_source, Cli, Target } = mod.current;
    const cli = new Cli(Target.Wasm32, "fib.cb");
    return compile_source(source, cli);
  }

  async function run(
    wasmBytes: Uint8Array,
    onRaylibStart?: () => void,
    signal?: AbortSignal,
  ): Promise<RunResult> {
    // --- Probe run: detect Raylib usage by throwing on init_window ---
    const probeLines: string[] = [];
    let probeMem: Uint8Array | null = null;
    let probeRandSeed = 1;

    const probeImports = {
      core: {
        write: (ptr: number, len: number) => {
          if (!probeMem) return;
          probeLines.push(
            new TextDecoder().decode(probeMem.slice(ptr, ptr + len)),
          );
        },
        write_int: (n: number) => probeLines.push(String(n)),
        writenl: () => probeLines.push("\n"),
        write_char: (c: number) => probeLines.push(String.fromCharCode(c)),
        time: (): number => Math.floor(Date.now() / 1000),
        srand: (seed: number): void => {
          probeRandSeed = seed >>> 0;
        },
        rand: (): number => {
          probeRandSeed = (probeRandSeed * 1103515245 + 12345) >>> 0;
          return (probeRandSeed >>> 16) & 0x7fff;
        },
        init_window: () => {
          throw new RaylibDetected();
        },
        close_window: () => {},
        window_should_close: (): boolean => false,
        begin_drawing: () => {},
        end_drawing: () => {},
        set_target_fps: () => {},
        is_key_pressed: (): boolean => false,
        is_gamepad_button_pressed: (): boolean => false,
        get_frame_time: (): number => 0,
        check_collision_recs: (): boolean => false,
        clear_background: () => {},
        draw_rectangle: () => {},
        draw_text: () => {},
      },
    };

    try {
      const probeResult = await WebAssembly.instantiate(
        wasmBytes,
        probeImports,
      );
      const probeInstance = (
        probeResult as unknown as WebAssembly.WebAssemblyInstantiatedSource
      ).instance;
      const memory = probeInstance.exports.memory as
        | WebAssembly.Memory
        | undefined;
      if (memory) probeMem = new Uint8Array(memory.buffer);
      (probeInstance.exports.main as () => void)();
      return { output: probeLines.join(""), error: null };
    } catch (err) {
      if (!(err instanceof RaylibDetected)) {
        return { output: "", error: String(err) };
      }
    }

    // --- Raylib program: show popup canvas, then run on main thread ---

    // Show the canvas popup. React will render it before the next RAF fires.
    onRaylibStart?.();

    // Wait one animation frame so React has rendered the canvas into the DOM.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );

    const raylibWasmUrl = new URL(
      "../../lib/raylib/raylib.wasm",
      import.meta.url,
    ).toString();

    // import() is module-cached after the first load.
    const { default: createRaylib } =
      await import("../../lib/raylib/raylib.js");

    // Capture the raw Raylib WASM exports (malloc, free, memory) from the
    // instantiateWasm callback — they are not exposed on the Module object.
    let rlWasmExports: WebAssembly.Exports | null = null;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let rl: Record<string, (...args: any[]) => any>;
    try {
      rl = await createRaylib({
        // Lazy getter so Raylib resolves the canvas after React has rendered it.
        get canvas() {
          return document.getElementById("canvas");
        },
        locateFile: (p: string) => (p.endsWith(".wasm") ? raylibWasmUrl : p),
        // Patch emscripten_sleep to a no-op before WASM is instantiated.
        // Raylib (on web) calls emscripten_sleep(0) inside WindowShouldClose
        // and WaitTime. Without this, Asyncify's unwind/rewind state machine
        // corrupts the WASM stack between RAF frames → "index out of bounds".
        // Making sleep a no-op means those calls return immediately and
        // Asyncify never runs, which is fine because we own the loop via RAF.
        instantiateWasm(
          info: WebAssembly.Imports,
          receive: (
            inst: WebAssembly.Instance,
            mod: WebAssembly.Module,
          ) => void,
        ) {
          WebAssembly.instantiateStreaming(fetch(raylibWasmUrl), info).then(
            (r) => {
              rlWasmExports = r.instance.exports;
              receive(r.instance, r.module);
            },
          );
        },
      });
    } catch (err) {
      return { output: "", error: `Raylib init failed: ${err}` };
    }

    // Raylib is compiled by Emscripten: its exported functions take pointers
    // into Raylib's own WASM memory, not packed JS values.
    // malloc/free/memory are on the raw WASM exports, not on the Module object.
    const rlMalloc = rlWasmExports!.malloc as (n: number) => number;
    const rlFree = rlWasmExports!.free as (p: number) => void;
    const rlMemory = rlWasmExports!.memory as WebAssembly.Memory;
    // Pre-allocate a permanent 4-byte buffer for Color structs.
    const rlColorBuf: number = rlMalloc(4);

    // Write a Color struct from user WASM memory into Raylib's WASM memory.
    function writeRaylibColor(colorPtr: number): number {
      const heap = new Uint8Array(rlMemory.buffer);
      if (memoryBuffer) {
        heap[rlColorBuf] = memoryBuffer[colorPtr];
        heap[rlColorBuf + 1] = memoryBuffer[colorPtr + 1];
        heap[rlColorBuf + 2] = memoryBuffer[colorPtr + 2];
        heap[rlColorBuf + 3] = memoryBuffer[colorPtr + 3];
      } else {
        heap[rlColorBuf] = heap[rlColorBuf + 1] = heap[rlColorBuf + 2] = 0;
        heap[rlColorBuf + 3] = 255;
      }
      return rlColorBuf;
    }

    // Write a null-terminated string into Raylib's WASM memory; caller must
    // free the returned pointer with rlFree() when done.
    function writeRaylibString(str: string): number {
      const encoded = new TextEncoder().encode(str);
      const ptr = rlMalloc(encoded.length + 1);
      const heap = new Uint8Array(rlMemory.buffer);
      heap.set(encoded, ptr);
      heap[ptr + encoded.length] = 0;
      return ptr;
    }

    const lines: string[] = [];
    let memoryBuffer: Uint8Array | null = null;
    let randSeed = 1;
    let raylibInitialized = false;

    // Declare Asyncify state BEFORE imports so end_drawing can close over
    // these variables by reference. They're set after WASM instantiation.
    let asyncifyState: AsyncifyState = "normal";
    let asyncifyDataAddr = 0;
    let asyncifyMemory: WebAssembly.Memory | null = null;
    let asyncify_start_unwind_fn: ((addr: number) => void) | null = null;
    let asyncify_stop_rewind_fn: (() => void) | null = null;

    const imports = {
      core: {
        write: (ptr: number, len: number) => {
          if (!memoryBuffer) return;
          lines.push(
            new TextDecoder().decode(memoryBuffer.slice(ptr, ptr + len)),
          );
        },
        write_int: (n: number) => lines.push(String(n)),
        writenl: () => lines.push("\n"),
        write_char: (c: number) => lines.push(String.fromCharCode(c)),
        time: (): number => Math.floor(Date.now() / 1000),
        srand: (seed: number): void => {
          randSeed = seed >>> 0;
        },
        rand: (): number => {
          randSeed = (randSeed * 1103515245 + 12345) >>> 0;
          return (randSeed >>> 16) & 0x7fff;
        },
        init_window: (w: number, h: number, t: number) => {
          if (!raylibInitialized) {
            rl._rl_InitWindow(w, h, t);
            raylibInitialized = true;
          }
        },
        set_target_fps: (_fps: number) => {
          if (!raylibInitialized) rl._rl_SetTargetFPS(0);
        },
        window_should_close: (): boolean => signal?.aborted ?? false,
        begin_drawing: () => rl._rl_BeginDrawing(),
        // Closes over asyncifyState / asyncifyDataAddr / asyncify_*_fn.
        // Those are let-variables set after WASM instantiation — closures
        // capture by reference so the updates are visible here at call time.
        end_drawing: () => {
          if (asyncifyState === "rewinding") {
            asyncify_stop_rewind_fn!();
            asyncifyState = "normal";
            return;
          }
          rl._rl_EndDrawing();
          // Reset stack-top pointer in the Asyncify data buffer.
          new Int32Array(asyncifyMemory!.buffer)[asyncifyDataAddr >> 2] =
            asyncifyDataAddr + 8;
          asyncifyState = "unwinding";
          asyncify_start_unwind_fn!(asyncifyDataAddr);
        },
        close_window: () => rl._rl_CloseWindow(),
        is_key_pressed: (key: number): boolean =>
          rl._rl_IsKeyPressed(key) as boolean,
        is_gamepad_button_pressed: (pad: number, key: number): boolean =>
          rl._rl_IsGamepadButtonPressed(pad, key) as boolean,
        get_frame_time: (): number => rl._rl_GetFrameTime() as number,
        check_collision_recs: (lhs: unknown, rhs: unknown): boolean =>
          rl._rl_CheckCollisionRecs(lhs, rhs) as boolean,
        clear_background: (ptr: number) => {
          rl._rl_ClearBackground(writeRaylibColor(ptr));
        },
        draw_rectangle: (
          x: number,
          y: number,
          w: number,
          h: number,
          colorPtr: number,
        ) => rl._rl_DrawRectangle(x, y, w, h, writeRaylibColor(colorPtr)),
        draw_text: (
          textPtr: number,
          x: number,
          y: number,
          fontSize: number,
          colorPtr: number,
        ) => {
          const text = memoryBuffer ? readCString(memoryBuffer, textPtr) : "";
          const rlTextPtr = writeRaylibString(text);
          rl._rl_DrawText(
            rlTextPtr,
            x,
            y,
            fontSize,
            writeRaylibColor(colorPtr),
          );
          rlFree(rlTextPtr);
        },
      },
    };

    // Apply Asyncify transform so end_drawing() can truly suspend mid-loop
    // and resume next frame with all WASM locals (game state) intact.
    const { default: binaryen } = await import("binaryen");
    const bModule = binaryen.readBinary(wasmBytes);
    bModule.runPasses(["asyncify"]);
    const asyncifiedBytes = bModule.emitBinary();
    bModule.dispose();

    const result = await WebAssembly.instantiate(asyncifiedBytes, imports);
    const instance = (
      result as unknown as WebAssembly.WebAssemblyInstantiatedSource
    ).instance;
    const memory = instance.exports.memory as WebAssembly.Memory | undefined;
    if (memory) memoryBuffer = new Uint8Array(memory.buffer);

    // Grow user WASM memory by 1 page (64 KB) and use that page as the
    // Asyncify data buffer. The buffer header stores stack_top and stack_end.
    const asyncifyPageIndex = (memory as WebAssembly.Memory).grow(1);
    const ASYNCIFY_DATA_SIZE = 65536;
    asyncifyDataAddr = asyncifyPageIndex * 65536;
    asyncifyMemory = memory as WebAssembly.Memory;
    // Refresh memoryBuffer after grow (backing ArrayBuffer is replaced).
    memoryBuffer = new Uint8Array(asyncifyMemory.buffer);
    const view32 = new Int32Array(asyncifyMemory.buffer);
    view32[asyncifyDataAddr >> 2] = asyncifyDataAddr + 8;
    view32[(asyncifyDataAddr >> 2) + 1] = asyncifyDataAddr + ASYNCIFY_DATA_SIZE;

    // Set the Asyncify function references — end_drawing closes over these.
    asyncify_start_unwind_fn = instance.exports.asyncify_start_unwind as (
      addr: number,
    ) => void;
    asyncify_stop_rewind_fn = instance.exports
      .asyncify_stop_rewind as () => void;
    const asyncify_stop_unwind = instance.exports
      .asyncify_stop_unwind as () => void;
    const asyncify_start_rewind = instance.exports.asyncify_start_rewind as (
      addr: number,
    ) => void;

    return new Promise<RunResult>((resolve) => {
      function finish(result: RunResult) {
        rlFree(rlColorBuf);
        resolve(result);
      }
      function runFrame() {
        if (asyncifyState === "rewinding") {
          asyncify_start_rewind(asyncifyDataAddr);
        }
        try {
          (instance.exports.main as () => void)();
          if (asyncifyState === "unwinding") {
            // Frame was yielded — stop the unwind, prepare for rewind next RAF.
            asyncify_stop_unwind();
            asyncifyState = "rewinding";
            requestAnimationFrame(runFrame);
          } else {
            // main() returned normally: game loop exited (or window closed).
            finish({ output: lines.join(""), error: null });
          }
        } catch (e) {
          finish({ output: "", error: String(e) });
        }
      }
      runFrame();
    });
  }

  return { ready, compile, run };
}
