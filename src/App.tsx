import { useEffect, useMemo, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import {
  Copy,
  FilePlus2,
  FileUp,
  Globe,
  Loader2,
  LogOut,
  MousePointer,
  PencilRuler,
  RefreshCcw,
  Save,
  Shield,
  TriangleAlert,
  Users
} from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import { AnnotationLayer } from "./components/AnnotationLayer";
import { CommentSidebar } from "./components/CommentSidebar";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import type {
  Annotation,
  ProjectFormState,
  ProjectMemberRecord,
  ProjectRecord,
  ProjectRole,
  ProjectSummary,
  ViewerMode
} from "./types";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const STORAGE_BUCKET = "project-files";

type ProxyResponse = {
  ok: boolean;
  html?: string;
  finalUrl?: string;
  baseUrl?: string;
  status?: number;
  message?: string;
};

type SaveState = "idle" | "saving" | "saved" | "error";

const defaultProjectForm: ProjectFormState = {
  title: "",
  sourceType: "web",
  sourceUrl: "",
  pdfFile: null
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

function roleLabel(role: ProjectRole) {
  switch (role) {
    case "owner":
      return "オーナー";
    case "editor":
      return "制作担当";
    case "client":
      return "お客様";
    case "viewer":
      return "閲覧のみ";
    default:
      return role;
  }
}

function makeAnnotationId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function makeProjectId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function projectShareUrl(projectId: string) {
  if (typeof window === "undefined") {
    return `?project=${projectId}`;
  }
  const url = new URL(window.location.href);
  url.searchParams.set("project", projectId);
  return url.toString();
}

export default function App() {
  const gasProxyUrl = import.meta.env.VITE_GAS_PROXY_URL as string | undefined;
  const supabaseConfigured = isSupabaseConfigured();

  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authMessage, setAuthMessage] = useState("");
  const [authError, setAuthError] = useState("");

  const [projects, setProjects] = useState<ProjectSummary[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [members, setMembers] = useState<ProjectMemberRecord[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<ProjectRole>("client");
  const [memberMessage, setMemberMessage] = useState("");
  const [memberError, setMemberError] = useState("");

  const [showCreateProject, setShowCreateProject] = useState(false);
  const [projectForm, setProjectForm] = useState<ProjectFormState>(defaultProjectForm);
  const [projectMessage, setProjectMessage] = useState("");
  const [projectError, setProjectError] = useState("");

  const [mode, setMode] = useState<ViewerMode>("web");
  const [interactionMode, setInteractionMode] = useState<"browse" | "annotate">("browse");
  const [urlInput, setUrlInput] = useState("");
  const [loadingWeb, setLoadingWeb] = useState(false);
  const [webHtml, setWebHtml] = useState("");
  const [webBaseUrl, setWebBaseUrl] = useState("https://example.com/");
  const [webError, setWebError] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [pdfSourceUrl, setPdfSourceUrl] = useState<string | null>(null);

  const [pdfPage, setPdfPage] = useState(1);
  const [pdfTotalPages, setPdfTotalPages] = useState(0);
  const [pdfPageOriginal, setPdfPageOriginal] = useState<{ width: number; height: number } | null>(
    null
  );
  const pdfWrapRef = useRef<HTMLDivElement>(null);
  const [pdfWrapWidth, setPdfWrapWidth] = useState(0);

  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [isDirty, setIsDirty] = useState(false);

  const activeProjectSummary = useMemo(
    () => projects.find((item) => item.project.id === activeProjectId) ?? null,
    [activeProjectId, projects]
  );
  const activeProject = activeProjectSummary?.project ?? null;
  const activeRole = activeProjectSummary?.role ?? null;
  const canEdit = activeRole === "owner" || activeRole === "editor" || activeRole === "client";
  const canManageMembers = activeRole === "owner" || activeRole === "editor";
  const srcDoc = useMemo(() => toSrcDoc(webHtml, webBaseUrl), [webHtml, webBaseUrl]);
  const annotationEnabled = interactionMode === "annotate" && canEdit;

  useEffect(() => {
    if (!pdfWrapRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setPdfWrapWidth(entry.contentRect.width);
      }
    });
    observer.observe(pdfWrapRef.current);
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
      mode === "web" ? item.mode === "web" : item.mode === "pdf" && item.page === pdfPage
    );
  }, [annotations, mode, pdfPage]);

  async function fetchProjects(targetUserId: string) {
    if (!supabase) return;
    setProjectsLoading(true);
    const { data, error } = await supabase
      .from("project_members")
      .select("id, role, project:projects(*)")
      .eq("user_id", targetUserId);

    setProjectsLoading(false);
    if (error) {
      setProjectError(error.message);
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, unknown>>)
      .map((row) => {
        const nestedProject = Array.isArray(row.project) ? row.project[0] : row.project;
        if (!nestedProject) {
          return null;
        }

        return {
          membershipId: String(row.id),
          role: row.role as ProjectRole,
          project: nestedProject as ProjectRecord
        };
      })
      .filter((row): row is ProjectSummary => Boolean(row))
      .sort((left, right) =>
        new Date(right.project.updated_at).getTime() - new Date(left.project.updated_at).getTime()
      );

    setProjects(mapped);

    const requestedProjectId = new URLSearchParams(window.location.search).get("project");
    const nextProject =
      mapped.find((item) => item.project.id === requestedProjectId) ??
      mapped.find((item) => item.project.id === activeProjectId) ??
      mapped[0] ??
      null;
    setActiveProjectId(nextProject?.project.id ?? null);
  }

  async function fetchProjectMembers(projectId: string) {
    if (!supabase) return;
    setMembersLoading(true);
    const { data, error } = await supabase
      .from("project_members")
      .select("id, project_id, user_id, role, joined_at, profile:profiles(id, email, full_name)")
      .eq("project_id", projectId);
    setMembersLoading(false);

    if (error) {
      setMemberError(error.message);
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      project_id: String(row.project_id),
      user_id: String(row.user_id),
      role: row.role as ProjectRole,
      joined_at: String(row.joined_at),
      profile: (row.profile as ProjectMemberRecord["profile"]) ?? null
    }));

    setMembers(mapped);
  }

  async function fetchAnnotations(projectId: string) {
    if (!supabase) return;
    const { data, error } = await supabase
      .from("project_annotations")
      .select("id, mode, page, x, y, width, height, comment")
      .eq("project_id", projectId)
      .order("sort_order", { ascending: true });

    if (error) {
      setSaveState("error");
      setSaveMessage(error.message);
      return;
    }

    const mapped = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      id: String(row.id),
      mode: row.mode as ViewerMode,
      page: Number(row.page),
      x: Number(row.x),
      y: Number(row.y),
      width: Number(row.width),
      height: Number(row.height),
      comment: String(row.comment ?? "")
    }));

    setAnnotations(mapped);
    setSelectedId(null);
    setIsDirty(false);
    setSaveState("idle");
    setSaveMessage("");
  }

  async function hydratePdf(project: ProjectRecord) {
    if (!supabase) return;
    setPdfSourceUrl(null);
    setPdfError("");

    if (!project.asset_path) {
      setPdfError("この案件にはPDFファイルが保存されていません。");
      return;
    }

    const { data, error } = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(project.asset_path, 60 * 60);

    if (error) {
      setPdfError(error.message);
      return;
    }

    setPdfSourceUrl(data.signedUrl);
  }

  async function loadWebPage(urlOverride?: string) {
    const target = normalizeUrl(urlOverride ?? urlInput);
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
      setWebError(error instanceof Error ? error.message : "不明なエラーが発生しました。");
    } finally {
      setLoadingWeb(false);
    }
  }

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) {
      setProjects([]);
      setActiveProjectId(null);
      return;
    }
    void fetchProjects(user.id);
  }, [user]);

  useEffect(() => {
    if (!activeProject) {
      setAnnotations([]);
      setMembers([]);
      setUrlInput("");
      setWebHtml("");
      setPdfSourceUrl(null);
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("project", activeProject.id);
    window.history.replaceState({}, "", url.toString());

    setMode(activeProject.source_type);
    setInteractionMode(activeProject.source_type === "web" ? "browse" : canEdit ? "annotate" : "browse");
    setUrlInput(activeProject.source_url ?? "");
    setPdfPage(1);
    setPdfTotalPages(0);
    setPdfPageOriginal(null);
    setPdfError("");
    setWebError("");
    void fetchProjectMembers(activeProject.id);
    void fetchAnnotations(activeProject.id);
    if (activeProject.source_type === "web" && activeProject.source_url) {
      void loadWebPage(activeProject.source_url);
    } else if (activeProject.source_type === "pdf") {
      void hydratePdf(activeProject);
    }
  }, [activeProject, canEdit]);

  useEffect(() => {
    if (!canEdit && interactionMode === "annotate") {
      setInteractionMode("browse");
    }
  }, [canEdit, interactionMode]);

  async function handleAuthSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) return;

    setAuthError("");
    setAuthMessage("");

    if (authMode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({
        email: authEmail,
        password: authPassword
      });
      if (error) {
        setAuthError(error.message);
        return;
      }
      setAuthMessage("ログインしました。");
      return;
    }

    const { error } = await supabase.auth.signUp({
      email: authEmail,
      password: authPassword,
      options: {
        data: {
          full_name: authFullName
        }
      }
    });

    if (error) {
      setAuthError(error.message);
      return;
    }

    setAuthMessage("確認メールを送信しました。メールを確認してログインしてください。");
  }

  async function handleSignOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setAuthEmail("");
    setAuthPassword("");
    setAuthFullName("");
  }

  async function handleCreateProject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !user) return;

    setProjectError("");
    setProjectMessage("");

    const title = projectForm.title.trim();
    if (!title) {
      setProjectError("案件名を入力してください。");
      return;
    }

    let assetPath: string | null = null;
    let assetName: string | null = null;
    const sourceUrl =
      projectForm.sourceType === "web" ? normalizeUrl(projectForm.sourceUrl) : null;

    if (projectForm.sourceType === "web" && !sourceUrl) {
      setProjectError("Web案件ではURLが必要です。");
      return;
    }

    if (projectForm.sourceType === "pdf") {
      if (!projectForm.pdfFile) {
        setProjectError("PDF案件ではファイルのアップロードが必要です。");
        return;
      }

      assetName = projectForm.pdfFile.name;
      assetPath = `${user.id}/${makeAnnotationId()}-${assetName}`;
      const { error: uploadError } = await supabase.storage
        .from(STORAGE_BUCKET)
        .upload(assetPath, projectForm.pdfFile, {
          upsert: false,
          contentType: projectForm.pdfFile.type
        });

      if (uploadError) {
        setProjectError(uploadError.message);
        return;
      }
    }

    const projectId = makeProjectId();

    const { error: projectInsertError } = await supabase
      .from("projects")
      .insert({
        id: projectId,
        title,
        source_type: projectForm.sourceType,
        source_url: sourceUrl,
        asset_path: assetPath,
        asset_name: assetName,
        created_by: user.id
      });

    if (projectInsertError) {
      setProjectError(projectInsertError.message ?? "案件作成に失敗しました。");
      return;
    }

    const { error: memberInsertError } = await supabase.from("project_members").insert({
      project_id: projectId,
      user_id: user.id,
      role: "owner"
    });

    if (memberInsertError) {
      setProjectError(memberInsertError.message);
      return;
    }

    setProjectMessage("案件を作成しました。");
    setProjectForm(defaultProjectForm);
    setShowCreateProject(false);
    await fetchProjects(user.id);
    setActiveProjectId(projectId);
  }

  async function handleAddMember(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase || !activeProject || !memberEmail.trim()) return;

    setMemberError("");
    setMemberMessage("");

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .eq("email", memberEmail.trim().toLowerCase())
      .single();

    if (profileError || !profile) {
      setMemberError("そのメールアドレスの担当者が見つかりません。先にサインアップしてもらってください。");
      return;
    }

    const { error } = await supabase.from("project_members").upsert(
      {
        project_id: activeProject.id,
        user_id: profile.id,
        role: memberRole
      },
      {
        onConflict: "project_id,user_id"
      }
    );

    if (error) {
      setMemberError(error.message);
      return;
    }

    setMemberMessage("メンバーを追加しました。");
    setMemberEmail("");
    await fetchProjectMembers(activeProject.id);
  }

  async function saveProject() {
    if (!supabase || !activeProject || !canEdit) return;

    setSaveState("saving");
    setSaveMessage("");

    const nextSourceUrl =
      activeProject.source_type === "web" ? normalizeUrl(urlInput) : activeProject.source_url;

    const { error: projectUpdateError } = await supabase
      .from("projects")
      .update({
        source_url: nextSourceUrl,
        updated_at: new Date().toISOString()
      })
      .eq("id", activeProject.id);

    if (projectUpdateError) {
      setSaveState("error");
      setSaveMessage(projectUpdateError.message);
      return;
    }

    const { error: deleteError } = await supabase
      .from("project_annotations")
      .delete()
      .eq("project_id", activeProject.id);

    if (deleteError) {
      setSaveState("error");
      setSaveMessage(deleteError.message);
      return;
    }

    if (annotations.length > 0) {
      const payload = annotations.map((item, index) => ({
        id: item.id,
        project_id: activeProject.id,
        mode: item.mode,
        page: item.page,
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
        comment: item.comment,
        sort_order: index
      }));

      const { error: insertError } = await supabase.from("project_annotations").insert(payload);
      if (insertError) {
        setSaveState("error");
        setSaveMessage(insertError.message);
        return;
      }
    }

    setSaveState("saved");
    setSaveMessage("案件内容を保存しました。");
    setIsDirty(false);
    if (user) {
      await fetchProjects(user.id);
    }
  }

  function createAnnotation(rect: { x: number; y: number; width: number; height: number }) {
    if (!canEdit) return;
    const newId = makeAnnotationId();
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
    setIsDirty(true);
    setSaveState("idle");
  }

  function updateAnnotation(id: string, patch: Partial<Annotation>) {
    if (!canEdit) return;
    setAnnotations((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item))
    );
    setIsDirty(true);
    setSaveState("idle");
  }

  function removeAnnotation(id: string) {
    if (!canEdit) return;
    setAnnotations((current) => current.filter((item) => item.id !== id));
    setSelectedId((current) => (current === id ? null : current));
    setIsDirty(true);
    setSaveState("idle");
  }

  async function handleRefreshWeb() {
    await loadWebPage();
    if (activeProject?.source_type === "web" && normalizeUrl(urlInput) !== (activeProject.source_url ?? "")) {
      setIsDirty(true);
    }
  }

  async function handleCopyShareUrl() {
    if (!activeProject) return;
    await navigator.clipboard.writeText(projectShareUrl(activeProject.id));
    setProjectMessage("共有URLをコピーしました。");
  }

  if (!supabaseConfigured) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 p-6">
        <div className="max-w-2xl rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-bold text-slate-900">Supabase設定が未完了です</h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            担当者ログインと案件共有を使うために、`.env.local` に
            `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` を追加してください。
            あわせて `supabase/schema.sql` を Supabase SQL Editor で実行すると、この画面が動き始めます。
          </p>
        </div>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <Loader2 className="animate-spin text-slate-600" size={28} />
      </div>
    );
  }

  if (!session || !user) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_#dbeafe,_transparent_35%),linear-gradient(180deg,_#f8fafc,_#e2e8f0)] p-6">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <section className="rounded-[2rem] bg-slate-950 p-10 text-white shadow-2xl">
            <p className="mb-4 inline-flex rounded-full border border-white/20 px-3 py-1 text-xs uppercase tracking-[0.24em] text-white/70">
              Project Review Hub
            </p>
            <h1 className="max-w-xl text-4xl font-bold leading-tight">
              お客様と制作担当が同じ案件を見ながら、修正指示を安全に共有できるAUNワークスペース
            </h1>
            <p className="mt-5 max-w-2xl text-sm leading-7 text-slate-300">
              ログインした担当者だけが案件へアクセスできます。案件共有URLは発行できますが、
              URLを知っているだけでは見られず、必ず案件メンバー権限で制御されます。
            </p>
          </section>

          <section className="rounded-[2rem] border border-slate-200 bg-white p-8 shadow-xl">
            <div className="mb-6 flex items-center gap-2 text-sm">
              <button
                type="button"
                className={`rounded-full px-4 py-2 ${
                  authMode === "signin" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
                onClick={() => setAuthMode("signin")}
              >
                ログイン
              </button>
              <button
                type="button"
                className={`rounded-full px-4 py-2 ${
                  authMode === "signup" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600"
                }`}
                onClick={() => setAuthMode("signup")}
              >
                新規登録
              </button>
            </div>

            <form className="space-y-4" onSubmit={handleAuthSubmit}>
              {authMode === "signup" && (
                <input
                  value={authFullName}
                  onChange={(event) => setAuthFullName(event.target.value)}
                  className="h-12 w-full rounded-2xl border border-slate-300 px-4"
                  placeholder="氏名"
                />
              )}
              <input
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-300 px-4"
                placeholder="メールアドレス"
                type="email"
              />
              <input
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                className="h-12 w-full rounded-2xl border border-slate-300 px-4"
                placeholder="パスワード"
                type="password"
              />
              <button
                type="submit"
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-slate-900 text-sm font-semibold text-white"
              >
                {authMode === "signin" ? "ログインする" : "アカウントを作成する"}
              </button>
            </form>

            {authMessage && <p className="mt-4 text-sm text-emerald-600">{authMessage}</p>}
            {authError && <p className="mt-4 text-sm text-rose-600">{authError}</p>}
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-100 text-slate-800">
      <aside className="flex w-[320px] flex-col border-r border-slate-300 bg-slate-950 text-white">
        <div className="border-b border-white/10 p-5">
          <p className="text-xs uppercase tracking-[0.22em] text-slate-400">AUN Workspace</p>
          <h1 className="mt-2 text-xl font-bold">案件共有ボード</h1>
          <p className="mt-2 text-sm text-slate-300">{user.email}</p>
        </div>

        <div className="flex items-center gap-2 p-4">
          <button
            type="button"
            onClick={() => setShowCreateProject((current) => !current)}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-slate-900"
          >
            <FilePlus2 size={16} />
            新規案件
          </button>
          <button
            type="button"
            onClick={handleSignOut}
            className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 text-slate-300"
            aria-label="ログアウト"
          >
            <LogOut size={16} />
          </button>
        </div>

        {showCreateProject && (
          <form className="mx-4 mb-4 rounded-2xl border border-white/10 bg-white/5 p-4" onSubmit={handleCreateProject}>
            <input
              value={projectForm.title}
              onChange={(event) =>
                setProjectForm((current) => ({ ...current, title: event.target.value }))
              }
              className="mb-3 h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white"
              placeholder="案件名"
            />
            <div className="mb-3 flex gap-2">
              <button
                type="button"
                onClick={() =>
                  setProjectForm((current) => ({ ...current, sourceType: "web", pdfFile: null }))
                }
                className={`flex-1 rounded-xl px-3 py-2 text-sm ${
                  projectForm.sourceType === "web"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-300"
                }`}
              >
                Web案件
              </button>
              <button
                type="button"
                onClick={() =>
                  setProjectForm((current) => ({ ...current, sourceType: "pdf", sourceUrl: "" }))
                }
                className={`flex-1 rounded-xl px-3 py-2 text-sm ${
                  projectForm.sourceType === "pdf"
                    ? "bg-blue-600 text-white"
                    : "bg-slate-900 text-slate-300"
                }`}
              >
                PDF案件
              </button>
            </div>

            {projectForm.sourceType === "web" ? (
              <input
                value={projectForm.sourceUrl}
                onChange={(event) =>
                  setProjectForm((current) => ({ ...current, sourceUrl: event.target.value }))
                }
                className="mb-3 h-10 w-full rounded-xl border border-white/10 bg-slate-900 px-3 text-sm text-white"
                placeholder="https://example.com"
              />
            ) : (
              <label className="mb-3 flex h-12 cursor-pointer items-center justify-center rounded-xl border border-dashed border-white/15 bg-slate-900 text-sm text-slate-300">
                {projectForm.pdfFile ? projectForm.pdfFile.name : "PDFを選択"}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(event) =>
                    setProjectForm((current) => ({
                      ...current,
                      pdfFile: event.target.files?.[0] ?? null
                    }))
                  }
                />
              </label>
            )}

            <button type="submit" className="h-10 w-full rounded-xl bg-emerald-500 text-sm font-semibold text-slate-950">
              案件を作成
            </button>
            {projectMessage && <p className="mt-3 text-xs text-emerald-300">{projectMessage}</p>}
            {projectError && <p className="mt-3 text-xs text-rose-300">{projectError}</p>}
          </form>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {projectsLoading && (
            <div className="flex justify-center py-6">
              <Loader2 className="animate-spin text-slate-400" size={18} />
            </div>
          )}

          {projects.map((item) => (
            <button
              key={item.project.id}
              type="button"
              onClick={() => setActiveProjectId(item.project.id)}
              className={`mb-2 w-full rounded-2xl border p-4 text-left ${
                activeProjectId === item.project.id
                  ? "border-blue-500 bg-blue-500/15"
                  : "border-white/10 bg-white/5"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">{item.project.title}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {item.project.source_type === "web" ? "Web" : "PDF"} / {roleLabel(item.role)}
                  </p>
                </div>
                <span className="rounded-full bg-white/10 px-2 py-1 text-[11px] text-slate-300">
                  {item.project.source_type.toUpperCase()}
                </span>
              </div>
            </button>
          ))}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1">
        <main className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-slate-300 bg-white px-5 py-4">
            {activeProject ? (
              <>
                <div className="flex flex-wrap items-center gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-slate-900">{activeProject.title}</h2>
                    <p className="text-sm text-slate-500">
                      共有URLはログイン済みの案件メンバーのみ閲覧できます。
                    </p>
                  </div>
                  <div className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={handleCopyShareUrl}
                      className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm"
                    >
                      <Copy size={16} />
                      共有URLをコピー
                    </button>
                    <button
                      type="button"
                      onClick={saveProject}
                      disabled={!canEdit || !isDirty || saveState === "saving"}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {saveState === "saving" ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <Save size={16} />
                      )}
                      保存
                    </button>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                  <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-600">
                    あなたの権限: {activeRole ? roleLabel(activeRole) : "-"}
                  </span>
                  <span
                    className={`rounded-full px-3 py-1 ${
                      isDirty ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
                    }`}
                  >
                    {isDirty ? "未保存の変更あり" : "保存済み"}
                  </span>
                  {saveMessage && (
                    <span
                      className={`rounded-full px-3 py-1 ${
                        saveState === "error" ? "bg-rose-100 text-rose-700" : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {saveMessage}
                    </span>
                  )}
                </div>
              </>
            ) : (
              <div>
                <h2 className="text-xl font-bold text-slate-900">案件を選択してください</h2>
                <p className="text-sm text-slate-500">左の一覧から案件を選ぶか、新規案件を作成してください。</p>
              </div>
            )}
          </header>

          {activeProject ? (
            <>
              <div className="border-b border-slate-300 bg-slate-50 px-4 py-3">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setMode("web")}
                    disabled={activeProject.source_type !== "web"}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                      mode === "web" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <Globe size={16} />
                    Web表示モード
                  </button>
                  <button
                    type="button"
                    onClick={() => setMode("pdf")}
                    disabled={activeProject.source_type !== "pdf"}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                      mode === "pdf" ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <FileUp size={16} />
                    PDFモード
                  </button>

                  <button
                    type="button"
                    onClick={() => setInteractionMode("browse")}
                    className={`ml-4 inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                      interactionMode === "browse"
                        ? "border-slate-900 bg-slate-900 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    <MousePointer size={16} />
                    閲覧モード
                  </button>
                  <button
                    type="button"
                    onClick={() => canEdit && setInteractionMode("annotate")}
                    disabled={!canEdit}
                    className={`inline-flex items-center gap-2 rounded border px-3 py-1.5 text-sm ${
                      interactionMode === "annotate"
                        ? "border-emerald-600 bg-emerald-600 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    } disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <PencilRuler size={16} />
                    注釈モード
                  </button>
                </div>

                {mode === "web" ? (
                  <div className="flex items-center gap-2">
                    <input
                      value={urlInput}
                      onChange={(event) => {
                        setUrlInput(event.target.value);
                        if (activeProject.source_type === "web") {
                          setIsDirty(normalizeUrl(event.target.value) !== (activeProject.source_url ?? ""));
                        }
                      }}
                      readOnly={!canEdit}
                      className="h-10 flex-1 rounded border border-slate-300 px-3 text-sm"
                      placeholder="https://example.com"
                    />
                    <button
                      type="button"
                      onClick={handleRefreshWeb}
                      className="inline-flex h-10 items-center gap-2 rounded bg-slate-800 px-4 text-sm text-white"
                    >
                      {loadingWeb ? (
                        <Loader2 className="animate-spin" size={16} />
                      ) : (
                        <RefreshCcw size={16} />
                      )}
                      読み込み
                    </button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-3 text-sm text-slate-600">
                    <span>{activeProject.asset_name ?? "PDFファイル"}</span>
                    {pdfTotalPages > 0 && (
                      <>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                          disabled={pdfPage <= 1}
                          onClick={() => setPdfPage((current) => Math.max(1, current - 1))}
                        >
                          前へ
                        </button>
                        <span>
                          {pdfPage} / {pdfTotalPages}
                        </span>
                        <button
                          type="button"
                          className="rounded border border-slate-300 px-2 py-1 disabled:opacity-40"
                          disabled={pdfPage >= pdfTotalPages}
                          onClick={() => setPdfPage((current) => Math.min(pdfTotalPages, current + 1))}
                        >
                          次へ
                        </button>
                      </>
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

                {mode === "pdf" && pdfError && (
                  <div className="mb-3 flex items-start gap-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
                    <TriangleAlert size={18} className="mt-0.5 shrink-0" />
                    <p>{pdfError}</p>
                  </div>
                )}

                {mode === "web" ? (
                  <div className="relative h-[calc(100vh-15rem)] min-h-[520px] overflow-hidden rounded border border-slate-300 bg-white">
                    {srcDoc ? (
                      <iframe
                        title="project-web-preview"
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
                      interactive={annotationEnabled}
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
                    {!pdfSourceUrl ? (
                      <div className="mt-8 text-slate-500">PDFを読み込み中です。</div>
                    ) : (
                      <div
                        className="relative bg-white shadow"
                        style={{ width: renderPdfSize.width, height: renderPdfSize.height }}
                      >
                        <Document
                          file={pdfSourceUrl}
                          onLoadSuccess={({ numPages }) => {
                            setPdfError("");
                            setPdfTotalPages(numPages);
                            setPdfPage((current) => Math.min(current, numPages));
                          }}
                          onLoadError={(error) => {
                            setPdfError(`PDF読み込みに失敗しました: ${String(error)}`);
                          }}
                        >
                          <Page
                            pageNumber={pdfPage}
                            width={renderPdfSize.width}
                            onLoadSuccess={(page) => {
                              setPdfPageOriginal({ width: page.width, height: page.height });
                            }}
                            renderAnnotationLayer={false}
                          />
                        </Document>
                        <AnnotationLayer
                          annotations={visibleAnnotations}
                          selectedId={selectedId}
                          interactive={annotationEnabled}
                          onSelect={setSelectedId}
                          onCreate={createAnnotation}
                          onChange={updateAnnotation}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center text-slate-500">
              左の「新規案件」から案件を作成できます。
            </div>
          )}
        </main>

        <div className="flex w-[420px] flex-col border-l border-slate-300 bg-white">
          <section className="border-b border-slate-200 p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users size={18} className="text-slate-700" />
              <h3 className="font-semibold text-slate-800">案件メンバー</h3>
            </div>

            {activeProject && canManageMembers && (
              <form className="space-y-2" onSubmit={handleAddMember}>
                <input
                  value={memberEmail}
                  onChange={(event) => setMemberEmail(event.target.value)}
                  className="h-10 w-full rounded-xl border border-slate-300 px-3 text-sm"
                  placeholder="追加するメールアドレス"
                  type="email"
                />
                <div className="flex gap-2">
                  <select
                    value={memberRole}
                    onChange={(event) => setMemberRole(event.target.value as ProjectRole)}
                    className="h-10 flex-1 rounded-xl border border-slate-300 px-3 text-sm"
                  >
                    <option value="editor">制作担当</option>
                    <option value="client">お客様</option>
                    <option value="viewer">閲覧のみ</option>
                  </select>
                  <button
                    type="submit"
                    className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 text-sm text-white"
                  >
                    <Shield size={16} />
                    追加
                  </button>
                </div>
              </form>
            )}

            {memberMessage && <p className="mt-2 text-sm text-emerald-600">{memberMessage}</p>}
            {memberError && <p className="mt-2 text-sm text-rose-600">{memberError}</p>}

            <div className="mt-3 space-y-2">
              {membersLoading && <p className="text-sm text-slate-500">読み込み中...</p>}
              {members.map((member) => (
                <div key={member.id} className="rounded-xl border border-slate-200 px-3 py-2">
                  <p className="text-sm font-medium text-slate-800">
                    {member.profile?.full_name || member.profile?.email || member.user_id}
                  </p>
                  <p className="text-xs text-slate-500">
                    {member.profile?.email ?? "メール不明"} / {roleLabel(member.role)}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <div className="min-h-0 flex-1">
            <CommentSidebar
              annotations={visibleAnnotations}
              selectedId={selectedId}
              readOnly={!canEdit}
              onSelect={setSelectedId}
              onUpdateComment={(id, comment) => updateAnnotation(id, { comment })}
              onDelete={removeAnnotation}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
