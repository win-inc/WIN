import { useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Globe, Loader2, RefreshCcw, TriangleAlert } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { AnnotationLayer } from "./components/AnnotationLayer";
import { CommentSidebar } from "./components/CommentSidebar";
import type { Annotation, ViewerMode } from "./types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

type ProxyResponse = {
  ok: boolean;
  html?: string;
  finalUrl?: string;
  baseUrl?: string;
  status?: number;
  message?: string;
};

function normalizeUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function toSrcDoc(html: string, baseUrl: string) {
  if (!html.trim()) return "";
  const baseTag = `<base href="${baseUrl}">`;
  const marker = "</head>";
  let withBase = html;
  if (!/<base\s/i.test(html)) {
    if (html.includes(marker)) {
      withBase = html.replace(marker, `${baseTag}${marker}`);
    } else {
      withBase = `${baseTag}${html}`;
    }
  }
  const stabilizationStyle = `
    <style>
      html, body { background: #fff; }
      img, video, canvas, svg { max-width: 100%; }
    </style>
  `;
  if (withBase.includes(marker)) {
    return withBase.replace(marker, `${stabilizationStyle}${marker}`);
  }
  return `${stabilizationStyle}${withBase}`;
}

export default function App() {
  const gasProxyUrl = import.meta.env.VITE_GAS_PROXY_URL as string | undefined;
  const [mode, setMode] = useState<ViewerMode>("web");
  const [urlInput, setUrlInput] = useState("https://example.com");
  const [loadingWeb, setLoadingWeb] = useState(false);
  const [webHtml, setWebHtml] = useState("");
  const [webBaseUrl, setWebBaseUrl] = useState("https://example.com/");
  const [webError, setWebError] = useState("");

  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfPageOriginal, setPdfPageOriginal] = useState<{ width: number; height: number } | null>(
    null
  );
  const pdfWrapRef = useRef<HTMLDivElement>(null);
  const [pdfWrapWidth, setPdfWrapWidth] = useState(0);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [nextId, setNextId] = useState(1);

  useEffect(() => {
    if (!pdfWrapRef.current) return;
    const element = pdfWrapRef.current;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPdfWrapWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const renderPdfSize = useMemo(() => {
    if (!pdfPageOriginal) {
      return { width: 760, height: 1000 };
    }
    const maxWidth = Math.max(320, Math.floor(pdfWrapWidth - 32));
    const scale = maxWidth / pdfPageOriginal.width;
    return {
      width: Math.floor(pdfPageOriginal.width * scale),
      height: Math.floor(pdfPageOriginal.height * scale)
    };
  }, [pdfPageOriginal, pdfWrapWidth]);

  const visibleAnnotations = useMemo(() => {
    return annotations.filter((item) =>
      mode === "web"
        ? item.mode === "web"
        : item.mode === "pdf" && item.page === pdfPage
    );
  }, [annotations, mode, pdfPage]);

  const srcDoc = useMemo(() => toSrcDoc(webHtml, webBaseUrl), [webHtml, webBaseUrl]);

  const loadWebPage = async () => {
    const target = normalizeUrl(urlInput);
    if (!target) {
      setWebError("URLを入力してください。");
      return;
    }
    if (!gasProxyUrl) {
      setWebError(
        "GASのデプロイURLが未設定です。.env.local に VITE_GAS_PROXY_URL を設定してください。"
      );
      return;
    }

    setLoadingWeb(true);
    setWebError("");
    try {
      const connector = gasProxyUrl.includes("?") ? "&" : "?";
      const endpoint = `${gasProxyUrl}${connector}url=${encodeURIComponent(target)}`;
      const response = await fetch(endpoint, {
        method: "GET",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=utf-8"
        }
      });
      const data = (await response.json()) as ProxyResponse;
      if (!response.ok || !data.ok || !data.html) {
        throw new Error(
          data.message ??
            `URL読み込みに失敗しました。HTTPステータス: ${data.status ?? response.status}`
        );
      }
      setWebHtml(data.html);
      setWebBaseUrl(data.baseUrl ?? data.finalUrl ?? target);
    } catch (error) {
      const message = error instanceof Error ? error.message : "不明なエラーが発生しました。";
      setWebError(message);
    } finally {
      setLoadingWeb(false);
    }
  };

  useEffect(() => {
    void loadWebPage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createAnnotation = (rect: { x: number; y: number; width: number; height: number }) => {
    const newId = nextId;
    setNextId((current) => current + 1);
    setAnnotations((current) => [
      ...current,
      {
        id: newId,
        mode,
        page: mode === "pdf" ? pdfPage : 1,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height,
        comment: ""
      }
    ]);
    setSelectedId(newId);
  };

  const updateAnnotation = (id: number, patch: Partial<Annotation>) => {
    setAnnotations((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
  };

  const removeAnnotation = (id: number) => {
    setAnnotations((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  };

  return (
    <div className="flex h-full w-full flex-col bg-slate-100">
      <header className="border-b border-slate-300 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-slate-800">AUN風 修正指示ツール（プロトタイプ）</h1>
        <p className="text-sm text-slate-500">
          画面上をドラッグして修正枠を追加し、右側のコメントとセットで管理します。
        </p>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setMode("web")}
                className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                  mode === "web"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <Globe size={16} />
                Web表示モード
              </button>
              <button
                type="button"
                onClick={() => setMode("pdf")}
                className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                  mode === "pdf"
                    ? "border-blue-600 bg-blue-600 text-white"
                    : "border-slate-300 bg-white text-slate-700"
                }`}
              >
                <FileUp size={16} />
                PDFモード
              </button>
            </div>

            {mode === "web" ? (
              <div className="flex items-center gap-2">
                <input
                  value={urlInput}
                  onChange={(event) => setUrlInput(event.target.value)}
                  className="h-10 flex-1 rounded border border-slate-300 px-3 text-sm"
                  placeholder="https://example.com"
                />
                <button
                  type="button"
                  onClick={loadWebPage}
                  className="inline-flex h-10 items-center gap-2 rounded bg-slate-800 px-4 text-sm text-white hover:bg-slate-700"
                >
                  {loadingWeb ? <Loader2 className="animate-spin" size={16} /> : <RefreshCcw size={16} />}
                  読み込み
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <label className="inline-flex h-10 cursor-pointer items-center rounded bg-slate-800 px-4 text-sm text-white hover:bg-slate-700">
                  PDFをアップロード
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      setPdfFile(file);
                      setPdfPage(1);
                      setPdfPageOriginal(null);
                    }}
                  />
                </label>
                <p className="text-sm text-slate-600">
                  {pdfFile ? `選択中: ${pdfFile.name}` : "PDF未選択"}
                </p>
                {pdfTotalPages > 0 && (
                  <div className="ml-auto flex items-center gap-2">
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
                      disabled={pdfPage <= 1}
                      onClick={() => setPdfPage((current) => Math.max(1, current - 1))}
                    >
                      前へ
                    </button>
                    <span className="text-sm text-slate-700">
                      {pdfPage} / {pdfTotalPages}
                    </span>
                    <button
                      type="button"
                      className="rounded border border-slate-300 px-2 py-1 text-sm disabled:opacity-40"
                      disabled={pdfPage >= pdfTotalPages}
                      onClick={() =>
                        setPdfPage((current) => Math.min(pdfTotalPages, current + 1))
                      }
                    >
                      次へ
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="relative flex-1 overflow-auto bg-slate-200 p-4">
            {mode === "web" && webError && (
              <div className="mb-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                <p>{webError}</p>
              </div>
            )}

            {mode === "web" ? (
              <div className="relative h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden rounded border border-slate-300 bg-white">
                {srcDoc ? (
                  <iframe
                    title="proxy-preview"
                    srcDoc={srcDoc}
                    className="absolute inset-0 h-full w-full border-0"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-slate-500">
                    URLを読み込むと表示されます。
                  </div>
                )}
                <AnnotationLayer
                  annotations={visibleAnnotations}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onCreate={createAnnotation}
                  onChange={updateAnnotation}
                />
              </div>
            ) : (
              <div
                ref={pdfWrapRef}
                className="flex min-h-[520px] items-start justify-center overflow-auto rounded border border-slate-300 bg-slate-50 p-3"
              >
                {!pdfFile ? (
                  <div className="mt-8 text-slate-500">PDFをアップロードしてください。</div>
                ) : (
                  <div
                    className="relative bg-white shadow"
                    style={{ width: renderPdfSize.width, height: renderPdfSize.height }}
                  >
                    <Document
                      file={pdfFile}
                      onLoadSuccess={({ numPages }) => {
                        setPdfTotalPages(numPages);
                        setPdfPage((current) => Math.min(current, numPages));
                      }}
                      onLoadError={(error) => {
                        setWebError(`PDF読み込みに失敗しました: ${String(error)}`);
                      }}
                    >
                      <Page
                        pageNumber={pdfPage}
                        width={renderPdfSize.width}
                        onLoadSuccess={(page) => {
                          setPdfPageOriginal({
                            width: page.width,
                            height: page.height
                          });
                        }}
                        renderAnnotationLayer={false}
                      />
                    </Document>
                    <AnnotationLayer
                      annotations={visibleAnnotations}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      onCreate={createAnnotation}
                      onChange={updateAnnotation}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </main>

        <CommentSidebar
          annotations={visibleAnnotations}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onUpdateComment={(id, comment) => updateAnnotation(id, { comment })}
          onDelete={removeAnnotation}
        />
      </div>
    </div>
  );
}
