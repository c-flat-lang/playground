"use client";

import {
  useState,
  useEffect,
  useRef,
  forwardRef,
  useImperativeHandle,
  Ref,
} from "react";
import { EditorState, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  lineNumbers,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, historyKeymap, history } from "@codemirror/commands";
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
} from "@codemirror/language";
import { oneDark } from "@codemirror/theme-one-dark";
import { vim } from "@replit/codemirror-vim";
import { rust } from "@codemirror/lang-rust";

const DEFAULT_SOURCE = `// Fib EXAMPLE
extern C fn write_int(s32) void;
extern C fn write_char(u8) void;

pub fn fib(n: s32, a: s32, b: s32) s32 {
  let is_zero = n == 0;
  if is_zero {
    return a;
  }
  return fib(n - 1, b, a + b);
}

pub fn main() s32 {
  let value = fib(10, 0, 1);
  write_int(value);
  write_char(10);
  return 0;
}
`;

async function decompress(data: string): Promise<string> {
  const ds = new DecompressionStream("deflate");
  const dw = ds.writable.getWriter();
  dw.write(Uint8Array.from(data, (char) => char.charCodeAt(0)));
  dw.close();

  const decompressed = await new Response(ds.readable).arrayBuffer();
  return new TextDecoder().decode(decompressed);
}

export interface EditorHandle {
  getValue: () => string;
}

type Props = {
  vimKeysEnabled: boolean;
};

function Editor(props: Props, ref: Ref<EditorHandle>) {
  const { vimKeysEnabled } = props;
  const [hash, setHash] = useState("");
  const vimCompartment = useRef(new Compartment()).current;

  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  useImperativeHandle(ref, () => ({
    getValue: () => viewRef.current?.state.doc.toString() ?? "",
  }));

  useEffect(() => {
    const update = () => setHash(window.location.hash.replace(/^#/, ""));
    update();
    window.addEventListener("hashchange", update);
    return () => window.removeEventListener("hashchange", update);
  }, []);

  useEffect(() => {
    if (!hash) return;
    const view = viewRef?.current;
    if (!view) return;

    const data = atob(hash);
    decompress(data)
      .then((source) => {
        const { state } = view;
        const fullRange = { from: 0, to: state.doc.length };
        view.dispatch({
          changes: { from: fullRange.from, to: fullRange.to, insert: source },
          selection: { anchor: source.length },
          scrollIntoView: true,
        });
      })
      .catch((e) => console.error(e));
  }, [hash]);

  useEffect(() => {
    if (!viewRef.current) {
      return;
    }
    viewRef.current.dispatch({
      effects: vimCompartment.reconfigure(vimKeysEnabled ? vim() : []),
    });
  }, [vimKeysEnabled]);

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: localStorage.getItem("src") ?? DEFAULT_SOURCE,
      extensions: [
        vimCompartment.of(vimKeysEnabled ? vim() : []),
        rust(),
        oneDark,
        history(),
        lineNumbers(),
        drawSelection(),
        highlightActiveLine(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle),
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorView.theme({
          "&": { height: "100%", fontSize: "14px" },
          ".cm-scroller": { fontFamily: "monospace", overflow: "auto" },
          ".cm-content": { padding: "8px 0" },
        }),
        EditorView.updateListener.of((v) => {
          if (v.docChanged) {
            const content = v.state.doc.toString();
            localStorage.setItem("src", content);
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;

    return () => view.destroy();
  }, []);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

export default forwardRef<EditorHandle, Props>(Editor);
