import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BarChart3, Home, Map, RotateCcw, Sparkles } from "lucide-react";
import { assetPath } from "./assetPath";
import { prefectureByCode, prefectureById, prefectures, regions, type Prefecture, type RegionId } from "./data/prefectures";
import {
  characterStageLabel,
  clearProgress,
  getPointCharacterStage,
  getReviewPrefectures,
  loadPoints,
  loadProgress,
  savePoints,
  saveProgress,
  statusLabel,
  todayString,
  updateChallengeResult,
  updateQuizResult,
  visitPrefecture,
  type CharacterStage,
  type ProgressState,
  type QuizType,
} from "./progress";

type Route = {
  path: string;
  query: URLSearchParams;
};

const basePath = import.meta.env.BASE_URL.endsWith("/") ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`;
const basePathWithoutSlash = basePath === "/" ? "" : basePath.replace(/\/$/, "");

const stripBasePath = (pathname: string) => {
  if (!basePathWithoutSlash) return pathname || "/";
  if (pathname === basePathWithoutSlash) return "/";
  if (pathname.startsWith(`${basePathWithoutSlash}/`)) return pathname.slice(basePathWithoutSlash.length) || "/";
  return pathname || "/";
};

const toBrowserPath = (path: string) => {
  const appPath = path.startsWith("/") ? path : `/${path}`;
  if (!basePathWithoutSlash) return appPath;
  return appPath === "/" ? `${basePathWithoutSlash}/` : `${basePathWithoutSlash}${appPath}`;
};

type CharacterLike = Pick<Prefecture, "id" | "name" | "characterName" | "characterImage">;
type ChallengeMode = "nameToLocation" | "locationToName" | "nameToCapital" | "capitalToName";
type ChallengeQuestion = {
  prefecture: Prefecture;
  mode: ChallengeMode;
};

const pointMasterCharacter: CharacterLike = {
  id: "prefecture-master",
  name: "都道府県マスター",
  characterName: "都道府県マスター",
  characterImage: assetPath("characters/special/prefecture-master.png"),
};

const challengeModes: ChallengeMode[] = ["nameToLocation", "locationToName", "nameToCapital", "capitalToName"];
const allRegionIds = regions.map((region) => region.id);

const navigate = (path: string) => {
  window.history.pushState(null, "", toBrowserPath(path));
  window.dispatchEvent(new Event("popstate"));
  window.scrollTo({ top: 0 });
};

const useRoute = (): Route => {
  const currentRoute = () => ({ path: stripBasePath(window.location.pathname), query: new URLSearchParams(window.location.search) });
  const [route, setRoute] = useState<Route>(currentRoute);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener("popstate", update);
    return () => window.removeEventListener("popstate", update);
  }, []);
  return route;
};

const pickOptions = (answer: Prefecture, pool: string[], getValue: (prefecture: Prefecture) => string) => {
  const distractors = prefectures
    .filter((prefecture) => prefecture.id !== answer.id && pool.includes(prefecture.regionId))
    .map(getValue)
    .sort(() => Math.random() - 0.5)
    .slice(0, 3);
  return [getValue(answer), ...distractors].sort(() => Math.random() - 0.5);
};

const isVisited = (progress: ProgressState, id: string) => progress[id]?.visited;

const formatJapaneseDate = (dateText: string) => {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
};

const createChallengeQuestions = (): ChallengeQuestion[] =>
  Array.from({ length: 10 }, () => ({
    prefecture: prefectures[Math.floor(Math.random() * prefectures.length)],
    mode: challengeModes[Math.floor(Math.random() * challengeModes.length)],
  }));

const challengeQuizType = (mode: ChallengeMode): QuizType => {
  if (mode === "nameToLocation") return "location";
  if (mode === "locationToName") return "name";
  if (mode === "nameToCapital") return "capital";
  return "reverse";
};

const challengeTitle = (question: ChallengeQuestion) => {
  if (question.mode === "nameToLocation") return `${question.prefecture.name}はどこ？`;
  if (question.mode === "locationToName") return "光っている県はどこ？";
  if (question.mode === "nameToCapital") return `${question.prefecture.name}の県庁所在地は？`;
  return `県庁所在地が${question.prefecture.capital}の都道府県は？`;
};

const isMapShape = (element: Element) => ["path", "polygon", "polyline", "rect", "circle", "ellipse"].includes(element.tagName.toLowerCase());

type Point = [number, number];
type ManualHitRegion = {
  id: string;
  points: Point[];
};

const manualHitRegions: ManualHitRegion[] = [
  { id: "tochigi", points: [[578, 568], [616, 568], [630, 602], [612, 632], [584, 628], [570, 596]] },
  { id: "saitama", points: [[548, 625], [610, 625], [612, 660], [548, 660]] },
  { id: "tokyo", points: [[560, 661], [611, 661], [611, 674], [586, 683], [560, 672]] },
  { id: "kanagawa", points: [[558, 676], [606, 676], [604, 701], [558, 701]] },
  { id: "shiga", points: [[392, 663], [431, 663], [431, 721], [393, 721]] },
  { id: "nara", points: [[379, 722], [418, 722], [418, 782], [379, 782]] },
  { id: "hiroshima", points: [[195, 702], [271, 702], [271, 762], [195, 762]] },
  { id: "kagawa", points: [[274, 733], [323, 733], [323, 754], [274, 754]] },
  { id: "kochi", points: [[216, 777], [314, 777], [314, 850], [216, 850]] },
  { id: "saga", points: [[68, 786], [113, 786], [113, 826], [68, 826]] },
];

const clientToSvgPoint = (container: HTMLDivElement, x: number, y: number): Point | null => {
  const svg = container.querySelector<SVGSVGElement>("svg");
  if (!svg) return null;
  const box = svg.getBoundingClientRect();
  if (!box.width || !box.height) return null;
  return [((x - box.left) / box.width) * 1000, ((y - box.top) / box.height) * 1000];
};

const pointInPolygon = ([x, y]: Point, points: Point[]) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const [xi, yi] = points[i];
    const [xj, yj] = points[j];
    const intersects = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
};

const findPrefectureIdFromPoint = (container: HTMLDivElement, x: number, y: number) => {
  const svgPoint = clientToSvgPoint(container, x, y);
  const manualRegion = svgPoint ? manualHitRegions.find((region) => pointInPolygon(svgPoint, region.points)) : undefined;
  if (manualRegion) return manualRegion.id;

  const visibleShape = document.elementsFromPoint(x, y).find((element) => {
    if (!container.contains(element) || element.classList.contains("prefecture-hit-area") || !isMapShape(element)) return false;
    return !!element.closest(".prefecture[data-code]");
  });
  const visibleCode = visibleShape?.closest<SVGGElement>(".prefecture[data-code]")?.dataset.code;
  if (visibleCode && prefectureByCode[visibleCode]) return prefectureByCode[visibleCode].id;

  const shapes = Array.from(container.querySelectorAll<SVGGeometryElement>(".prefecture[data-code] path, .prefecture[data-code] polygon, .prefecture[data-code] polyline, .prefecture[data-code] rect, .prefecture[data-code] circle, .prefecture[data-code] ellipse"))
    .filter((shape) => !shape.classList.contains("prefecture-hit-area"));
  const shapeCandidates = shapes
    .map((shape) => {
      if (typeof shape.getScreenCTM !== "function" || typeof shape.isPointInFill !== "function") return null;
      const matrix = shape.getScreenCTM();
      const prefectureElement = shape.closest<SVGGElement>(".prefecture[data-code]");
      const code = prefectureElement?.dataset.code;
      const prefecture = code ? prefectureByCode[code] : undefined;
      if (!matrix || !prefecture) return null;
      const point = new DOMPoint(x, y).matrixTransform(matrix.inverse());
      const isInside = shape.isPointInFill(point) || shape.isPointInStroke(point);
      if (!isInside) return null;
      const box = shape.getBoundingClientRect();
      return { prefecture, area: box.width * box.height };
    })
    .filter((candidate): candidate is { prefecture: Prefecture; area: number } => !!candidate)
    .sort((a, b) => a.area - b.area);

  if (shapeCandidates[0]?.prefecture) return shapeCandidates[0].prefecture.id;

  const hitAreas = Array.from(container.querySelectorAll<SVGRectElement>(".prefecture-hit-area"));
  const candidates = hitAreas
    .map((hitArea) => {
      const rect = hitArea.getBoundingClientRect();
      const prefectureElement = hitArea.closest<SVGGElement>(".prefecture[data-code]");
      const code = prefectureElement?.dataset.code;
      const prefecture = code ? prefectureByCode[code] : undefined;
      return { prefecture, rect, area: rect.width * rect.height };
    })
    .filter(({ prefecture, rect }) => !!prefecture && x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
    .sort((a, b) => a.area - b.area);

  if (candidates[0]?.prefecture) return candidates[0].prefecture.id;

  const target = document.elementFromPoint(x, y);
  const element = target?.closest?.<SVGGElement>(".prefecture[data-code]");
  const code = element?.dataset.code;
  return code ? prefectureByCode[code]?.id : undefined;
};

const setMapHover = (container: HTMLDivElement, x: number, y: number) => {
  const id = findPrefectureIdFromPoint(container, x, y);
  container.querySelectorAll(".map-hover").forEach((element) => element.classList.remove("map-hover"));
  if (!id) return;
  const prefecture = prefectureById[id];
  const element = prefecture ? container.querySelector<SVGGElement>(`.prefecture[data-code="${prefecture.code}"]`) : null;
  element?.classList.add("map-hover");
};

const stripSvgTooltips = (markup: string) => {
  const parser = new DOMParser();
  const document = parser.parseFromString(markup, "image/svg+xml");
  document.querySelectorAll("title").forEach((title) => title.remove());
  document.querySelectorAll("[title]").forEach((element) => element.removeAttribute("title"));
  return document.documentElement.outerHTML;
};

function App() {
  const route = useRoute();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());
  const [points, setPoints] = useState(() => loadPoints());

  useEffect(() => saveProgress(progress), [progress]);
  useEffect(() => savePoints(points), [points]);

  const setAndSave = (next: ProgressState) => setProgress(next);
  const reviewPrefectures = useMemo(() => getReviewPrefectures(progress), [progress]);

  const page = (() => {
    if (route.path === "/map") return <MapPage progress={progress} />;
    if (route.path.startsWith("/region/")) return <RegionPage id={decodeURIComponent(route.path.split("/").pop() ?? "") as RegionId} progress={progress} />;
    if (route.path.startsWith("/prefecture/")) return <PrefecturePage id={route.path.split("/").pop() ?? ""} progress={progress} setProgress={setAndSave} />;
    if (route.path === "/quiz") return <QuizPage query={route.query} progress={progress} setProgress={setAndSave} />;
    if (route.path === "/challenge") return <ChallengePage progress={progress} setProgress={setAndSave} setPoints={setPoints} />;
    if (route.path === "/review") return <ReviewPage progress={progress} />;
    if (route.path === "/dex") return <CharacterDexPage progress={progress} points={points} />;
    if (route.path === "/stats") return <StatsPage progress={progress} points={points} setProgress={setAndSave} setPoints={setPoints} />;
    return <HomePage progress={progress} points={points} reviewPrefectures={reviewPrefectures} />;
  })();

  return (
    <div className="app-shell">
      <main className="page">{page}</main>
      <BottomNavigation />
    </div>
  );
}

function BottomNavigation() {
  const currentPath = stripBasePath(window.location.pathname);
  const items = [
    ["/", Home, "ホーム"],
    ["/map", Map, "地図"],
    ["/review", RotateCcw, "復習"],
    ["/dex", Sparkles, "ずかん"],
    ["/stats", BarChart3, "成績"],
  ] as const;
  return (
    <nav className="bottom-nav">
      {items.map(([path, Icon, label]) => (
        <button key={path} className={currentPath === path ? "active" : ""} onClick={() => navigate(path)}>
          <Icon size={22} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  );
}

function PageHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="page-header">
      <p className="eyebrow">日本地図キャラずかん</p>
      <h1>{title}</h1>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}

function HomePage({ progress, points, reviewPrefectures }: { progress: ProgressState; points: number; reviewPrefectures: Prefecture[] }) {
  const collected = prefectures.filter((prefecture) => progress[prefecture.id].characterStage !== "undiscovered").length;
  const mastered = prefectures.filter((prefecture) => progress[prefecture.id].learningStatus === "master").length;
  const weak = prefectures.filter((prefecture) => progress[prefecture.id].isWeak).slice(0, 6);
  const learningRegions = regions.filter((region) => prefectures.some((prefecture) => prefecture.regionId === region.id && isVisited(progress, prefecture.id)));

  return (
    <>
      <section className="home-hero">
        <img src={assetPath("images/main-visual.png")} alt="日本の名物やキャラクターが集まった絵本風のメインビジュアル" />
        <div className="hero-overlay">
          <h1>日本地図キャラずかん</h1>
          <p>県名、県庁所在地、地図の場所をキャラといっしょに覚えよう。</p>
        </div>
      </section>
      <section className="hero-actions">
        <button className="primary-action" onClick={() => navigate("/review")}>
          今日の復習 {reviewPrefectures.length}けん
        </button>
        <button className="challenge-action" onClick={() => navigate("/challenge")}>腕試し</button>
        <button className="secondary-action" onClick={() => navigate("/map")}>新しい地方を学ぶ</button>
      </section>
      <section className="stats-strip">
        <Metric label="集めたキャラ" value={`${collected}/47`} />
        <Metric label="マスター" value={`${mastered}/47`} />
        <Metric label="ポイント" value={`${points}P`} />
        <Metric label="今日" value={formatJapaneseDate(todayString())} />
      </section>
      <SectionTitle title="今日の復習" />
      <PrefectureList items={reviewPrefectures} progress={progress} empty="今日は復習がありません。新しい県に会いにいこう。" />
      <SectionTitle title="苦手な県" />
      <PrefectureList items={weak} progress={progress} empty="苦手な県はまだありません。" />
      <SectionTitle title="学習中の地方" />
      <div className="region-grid">
        {(learningRegions.length ? learningRegions : regions.slice(0, 2)).map((region) => (
          <button key={region.id} onClick={() => navigate(`/region/${region.id}`)}>{region.name}</button>
        ))}
      </div>
      <SectionTitle title="新しい地方を学ぶ" />
      <div className="quick-links">
        <button onClick={() => navigate("/map")}>地図から学ぶ</button>
        <button onClick={() => navigate("/dex")}>キャラずかんを見る</button>
        <button onClick={() => navigate("/stats")}>成績を見る</button>
      </div>
    </>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div><strong>{value}</strong><span>{label}</span></div>;
}

function SectionTitle({ title }: { title: string }) {
  return <h2 className="section-title">{title}</h2>;
}

function PrefectureList({ items, progress, empty }: { items: Prefecture[]; progress: ProgressState; empty: string }) {
  if (!items.length) return <p className="empty">{empty}</p>;
  return (
    <div className="prefecture-list">
      {items.map((prefecture) => (
        <button key={prefecture.id} onClick={() => navigate(`/prefecture/${prefecture.id}`)}>
          <CharacterIcon prefecture={prefecture} stage={progress[prefecture.id].characterStage} />
          <span>{prefecture.name}</span>
          <small>{statusLabel[progress[prefecture.id].learningStatus]}</small>
        </button>
      ))}
    </div>
  );
}

function MapPage({ progress }: { progress: ProgressState }) {
  return (
    <>
      <PageHeader title="地図から学ぶ" subtitle="県や地方をタップしてカードを見よう。" />
      <JapanMap progress={progress} onSelect={(id) => navigate(`/prefecture/${id}`)} />
      <SectionTitle title="地方から選ぶ" />
      <div className="region-grid">{regions.map((region) => <button key={region.id} onClick={() => navigate(`/region/${region.id}`)}>{region.name}</button>)}</div>
    </>
  );
}

function JapanMap({
  progress,
  onSelect,
  highlightId,
  showProgressColors = true,
}: {
  progress: ProgressState;
  onSelect: (id: string) => void;
  highlightId?: string;
  showProgressColors?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgMarkup, setSvgMarkup] = useState("");

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    fetch(assetPath(isMobile ? "maps/map-mobile.svg" : "maps/map-full.svg"))
      .then((response) => response.text())
      .then((markup) => setSvgMarkup(stripSvgTooltips(markup)))
      .catch(() => setSvgMarkup(""));
  }, []);

  useEffect(() => {
    if (!svgMarkup || !containerRef.current) return;
    const container = containerRef.current;
    const prefectureElements = container.querySelectorAll<SVGGElement>(".prefecture[data-code]");
    prefectureElements.forEach((element) => {
      const code = element.dataset.code;
      const prefecture = code ? prefectureByCode[code] : undefined;
      if (!prefecture) return;
      const item = progress[prefecture.id];
      const status = highlightId === prefecture.id ? "highlight" : showProgressColors ? item.isWeak ? "weak" : item.learningStatus === "master" ? "master" : item.visited ? "visited" : "new" : "quiz";
      element.classList.remove("new", "visited", "weak", "master", "highlight", "quiz");
      element.classList.add("map-pref", status);
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", prefecture.name);
      element.querySelectorAll(".prefecture-hit-area").forEach((hitArea) => hitArea.remove());
      const shapes = Array.from(element.children).filter(isMapShape) as SVGGraphicsElement[];
      shapes.forEach((shape) => {
        const box = shape.getBBox();
        if (box.width <= 0 || box.height <= 0 || box.width > 130 || box.height > 220) return;
        const padding = box.width < 36 || box.height < 36 ? 8 : 5;
        const rightPadding = prefecture.code === "14" ? -5 : padding;
        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hitArea.setAttribute("class", "prefecture-hit-area");
        hitArea.setAttribute("x", String(box.x - padding));
        hitArea.setAttribute("y", String(box.y - padding));
        hitArea.setAttribute("width", String(box.width + padding + rightPadding));
        hitArea.setAttribute("height", String(box.height + padding * 2));
        element.appendChild(hitArea);
      });
    });
  }, [svgMarkup, progress, highlightId, showProgressColors]);

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const id = findPrefectureIdFromPoint(event.currentTarget, event.clientX, event.clientY);
    if (id) onSelect(id);
  };

  const handleMapMouseMove = (event: MouseEvent<HTMLDivElement>) => {
    setMapHover(event.currentTarget, event.clientX, event.clientY);
  };

  const handleMapMouseLeave = (event: MouseEvent<HTMLDivElement>) => {
    event.currentTarget.querySelectorAll(".map-hover").forEach((element) => element.classList.remove("map-hover"));
  };

  const handleMapKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const target = (event.target as Element).closest<SVGGElement>(".prefecture[data-code]");
    const code = target?.dataset.code;
    const prefecture = code ? prefectureByCode[code] : undefined;
    if (prefecture) {
      event.preventDefault();
      onSelect(prefecture.id);
    }
  };

  if (!svgMarkup) {
    return <PrefectureList items={prefectures} progress={progress} empty="" />;
  }

  return (
    <div
      ref={containerRef}
      className="japan-map"
      role="img"
      aria-label="都道府県を選べる日本地図"
      onClick={handleMapClick}
      onKeyDown={handleMapKeyDown}
      onMouseMove={handleMapMouseMove}
      onMouseLeave={handleMapMouseLeave}
      dangerouslySetInnerHTML={{ __html: svgMarkup }}
    />
  );
}

function RegionPage({ id, progress }: { id: RegionId; progress: ProgressState }) {
  const region = regions.find((item) => item.id === id) ?? regions[0];
  const items = prefectures.filter((prefecture) => prefecture.regionId === region.id);
  return (
    <>
      <PageHeader title={region.name} subtitle="この地方の県を見て、クイズでたしかめよう。" />
      <PrefectureList items={items} progress={progress} empty="" />
      <div className="quick-links region-actions">
        <button onClick={() => navigate(`/quiz?region=${region.id}&mode=name`)}>この地方を学習する</button>
        <button onClick={() => navigate(`/quiz?region=${region.id}&mode=capital&review=1`)}>この地方を復習する</button>
        <button onClick={() => navigate(`/quiz?region=${region.id}&mode=capital`)}>県庁所在地だけ練習</button>
        <button onClick={() => navigate(`/quiz?region=${region.id}&mode=location`)}>地図の位置だけ練習</button>
      </div>
    </>
  );
}

function PrefecturePage({ id, progress, setProgress }: { id: string; progress: ProgressState; setProgress: (progress: ProgressState) => void }) {
  const prefecture = prefectureById[id] ?? prefectures[0];
  useEffect(() => setProgress(visitPrefecture(progress, prefecture.id)), []);
  const item = progress[prefecture.id];
  return (
    <>
      <PageHeader title={prefecture.name} subtitle={prefecture.kana} />
      <section className="prefecture-card">
        <CharacterIcon prefecture={prefecture} stage={item.characterStage} large />
        <div>
          <p className="badge">{statusLabel[item.learningStatus]}</p>
          <h2>{prefecture.characterName}</h2>
          <p>地方：{prefecture.region}</p>
          <p>県庁所在地：{prefecture.capital}（{prefecture.capitalKana}）</p>
          <p>{prefecture.miniKnowledge}</p>
        </div>
      </section>
      <JapanMap progress={progress} onSelect={(selected) => navigate(`/prefecture/${selected}`)} highlightId={prefecture.id} />
      <div className="quick-links">
        <button onClick={() => navigate(`/quiz?prefecture=${prefecture.id}&mode=location`)}>地図タップクイズ</button>
        <button onClick={() => navigate(`/quiz?prefecture=${prefecture.id}&mode=name`)}>県名当てクイズ</button>
        <button onClick={() => navigate(`/quiz?prefecture=${prefecture.id}&mode=capital`)}>県庁所在地クイズ</button>
        <button onClick={() => navigate(`/quiz?prefecture=${prefecture.id}&mode=reverse`)}>逆引きクイズ</button>
      </div>
    </>
  );
}

function QuizPage({ query, progress, setProgress }: { query: URLSearchParams; progress: ProgressState; setProgress: (progress: ProgressState) => void }) {
  const regionId = query.get("region") as RegionId | null;
  const pool = regionId ? prefectures.filter((prefecture) => prefecture.regionId === regionId) : prefectures;
  const target = prefectureById[query.get("prefecture") ?? ""] ?? pool[Math.floor(Math.random() * pool.length)] ?? prefectures[0];
  const mode = (query.get("mode") as QuizType | null) ?? "capital";
  const isReview = query.get("review") === "1";
  const [answered, setAnswered] = useState<{ correct: boolean; value: string } | null>(null);
  const regionPool = [target.regionId];
  const options = useMemo(() => {
    if (mode === "capital") return pickOptions(target, regionPool, (prefecture) => prefecture.capital);
    if (mode === "reverse" || mode === "name") return pickOptions(target, regionPool, (prefecture) => prefecture.name);
    return [];
  }, [target.id, mode]);
  const question = mode === "location" ? `${target.name}はどこ？` : mode === "capital" ? `${target.name}の県庁所在地は？` : mode === "reverse" ? `県庁所在地が${target.capital}の都道府県は？` : `光っている県はどこ？`;
  const answer = mode === "capital" ? target.capital : target.name;
  const submit = (value: string) => {
    const correct = value === answer;
    setAnswered({ correct, value });
    setProgress(updateQuizResult(progress, target.id, mode, correct, isReview));
  };
  return (
    <>
      <PageHeader title="クイズ" subtitle={question} />
      {mode === "location" || mode === "name" ? (
        <JapanMap
          progress={progress}
          highlightId={mode === "name" ? target.id : undefined}
          showProgressColors={false}
          onSelect={(id) => mode === "location" && submit(prefectureById[id].name)}
        />
      ) : null}
      {mode !== "location" && (
        <div className="quiz-options">
          {options.map((option) => <button key={option} onClick={() => submit(option)} disabled={!!answered}>{option}</button>)}
        </div>
      )}
      {answered && (
        <section className={`result ${answered.correct ? "correct" : "wrong"}`}>
          <h2>{answered.correct ? "せいかい！" : "もう一回おぼえよう"}</h2>
          <p>答え：{answer}</p>
          <p>{target.miniKnowledge}</p>
          <button onClick={() => navigate(isReview ? "/review" : `/prefecture/${target.id}`)}>つぎへ</button>
        </section>
      )}
    </>
  );
}

function ChallengePage({ progress, setProgress, setPoints }: { progress: ProgressState; setProgress: (progress: ProgressState) => void; setPoints: (update: (points: number) => number) => void }) {
  const [questions, setQuestions] = useState<ChallengeQuestion[]>(() => createChallengeQuestions());
  const [index, setIndex] = useState(0);
  const [answered, setAnswered] = useState<{ correct: boolean; value: string } | null>(null);
  const [completed, setCompleted] = useState(false);
  const question = questions[index];
  const answer = question.mode === "nameToCapital" ? question.prefecture.capital : question.prefecture.name;
  const options = useMemo(() => {
    if (question.mode === "nameToLocation") return [];
    if (question.mode === "nameToCapital") return pickOptions(question.prefecture, allRegionIds, (prefecture) => prefecture.capital);
    return pickOptions(question.prefecture, allRegionIds, (prefecture) => prefecture.name);
  }, [question]);

  const restart = () => {
    setQuestions(createChallengeQuestions());
    setIndex(0);
    setAnswered(null);
    setCompleted(false);
  };

  const nextQuestion = () => {
    setIndex((current) => current + 1);
    setAnswered(null);
  };

  const submit = (value: string) => {
    if (answered || completed) return;
    const correct = value === answer;
    setAnswered({ correct, value });
    setProgress(updateChallengeResult(progress, question.prefecture.id, challengeQuizType(question.mode), correct));
    if (correct && index === questions.length - 1) {
      setCompleted(true);
      setPoints((points) => points + 100);
    }
  };

  return (
    <>
      <PageHeader title="腕試し" subtitle={`${index + 1}/10　${challengeTitle(question)}`} />
      <section className="challenge-panel">
        <div className="challenge-progress" aria-label="腕試しの進み具合">
          {questions.map((item, itemIndex) => (
            <span key={`${item.prefecture.id}-${item.mode}-${itemIndex}`} className={itemIndex < index || completed ? "done" : itemIndex === index ? "current" : ""} />
          ))}
        </div>
        {(question.mode === "nameToLocation" || question.mode === "locationToName") && (
          <JapanMap
            key={`challenge-map-${index}-${question.mode}-${question.prefecture.id}`}
            progress={progress}
            highlightId={question.mode === "locationToName" ? question.prefecture.id : undefined}
            showProgressColors={false}
            onSelect={(id) => question.mode === "nameToLocation" && submit(prefectureById[id].name)}
          />
        )}
        {question.mode !== "nameToLocation" && (
          <div className="quiz-options">
            {options.map((option) => <button key={option} onClick={() => submit(option)} disabled={!!answered || completed}>{option}</button>)}
          </div>
        )}
      </section>
      {answered && (
        <section className={`result ${answered.correct ? "correct" : "wrong"}`}>
          <h2>{completed ? "10問連続せいかい！" : answered.correct ? "せいかい！" : "もう一回おぼえよう"}</h2>
          <p>答え：{answer}</p>
          {completed && <p>100ポイントをもらいました。</p>}
          {!answered.correct && <p>{question.prefecture.miniKnowledge}</p>}
          <div className="challenge-actions">
            {answered.correct && !completed && <button onClick={nextQuestion}>つぎの問題へ</button>}
            {completed && <button onClick={restart}>もう一回チャレンジ</button>}
            {!answered.correct && <button onClick={restart}>1問目からやり直す</button>}
            {!answered.correct && <button onClick={() => navigate(`/prefecture/${question.prefecture.id}`)}>カードで復習</button>}
            {completed && <button onClick={() => navigate("/dex")}>ずかんを見る</button>}
          </div>
        </section>
      )}
    </>
  );
}

function ReviewPage({ progress }: { progress: ProgressState }) {
  const items = getReviewPrefectures(progress);
  return (
    <>
      <PageHeader title="今日の復習" subtitle="日をあけて答えられたら、マスターに近づくよ。" />
      <section className="review-panel">
        <strong>{items.length}</strong>
        <span>復習する県</span>
        <button disabled={!items.length} onClick={() => navigate(`/quiz?prefecture=${items[0]?.id}&mode=capital&review=1`)}>スタート</button>
      </section>
      <PrefectureList items={items} progress={progress} empty="今日は復習がありません。新しい地方を学ぼう。" />
      <button className="secondary-action full" onClick={() => navigate("/map")}>新しい学習へ</button>
    </>
  );
}

function CharacterDexPage({ progress, points }: { progress: ProgressState; points: number }) {
  const masterStage = getPointCharacterStage(points);
  return (
    <>
      <PageHeader title="ご当地キャラずかん" subtitle="会ったキャラがここに集まるよ。" />
      <div className="dex-grid">
        {prefectures.map((prefecture) => (
          <button key={prefecture.id} className={`dex-card ${progress[prefecture.id].characterStage}`} onClick={() => navigate(`/prefecture/${prefecture.id}`)}>
            <CharacterIcon prefecture={prefecture} stage={progress[prefecture.id].characterStage} />
            <strong>{progress[prefecture.id].characterStage === "undiscovered" ? "？？？" : prefecture.characterName}</strong>
            <span>{prefecture.name}</span>
            <small>{characterStageLabel[progress[prefecture.id].characterStage]}</small>
          </button>
        ))}
        <button className={`dex-card point-master ${masterStage}`} onClick={() => navigate("/challenge")}>
          <CharacterIcon prefecture={pointMasterCharacter} stage={masterStage} />
          <strong>{masterStage === "undiscovered" ? "？？？" : pointMasterCharacter.characterName}</strong>
          <span>48番目のキャラ</span>
          <small>{masterStage === "master" ? "完全解放" : `${points}/10000P`}</small>
        </button>
      </div>
    </>
  );
}

function StatsPage({ progress, points, setProgress, setPoints }: { progress: ProgressState; points: number; setProgress: (progress: ProgressState) => void; setPoints: (points: number) => void }) {
  const collected = prefectures.filter((prefecture) => progress[prefecture.id].characterStage !== "undiscovered").length;
  const mastered = prefectures.filter((prefecture) => progress[prefecture.id].learningStatus === "master").length;
  const weak = prefectures.filter((prefecture) => progress[prefecture.id].isWeak);
  const rate = (correct: keyof ProgressState[string], wrong: keyof ProgressState[string]) => {
    const c = prefectures.reduce((sum, prefecture) => sum + Number(progress[prefecture.id][correct]), 0);
    const w = prefectures.reduce((sum, prefecture) => sum + Number(progress[prefecture.id][wrong]), 0);
    return c + w === 0 ? "0%" : `${Math.round((c / (c + w)) * 100)}%`;
  };
  return (
    <>
      <PageHeader title="成績" subtitle="できるようになったことを見てみよう。" />
      <section className="stats-strip">
        <Metric label="集めたキャラ" value={`${collected}/47`} />
        <Metric label="マスター" value={`${mastered}/47`} />
        <Metric label="ポイント" value={`${points}P`} />
        <Metric label="苦手" value={`${weak.length}`} />
      </section>
      <div className="progress-bars">
        {regions.map((region) => {
          const list = prefectures.filter((prefecture) => prefecture.regionId === region.id);
          const done = list.filter((prefecture) => progress[prefecture.id].learningStatus === "master").length;
          return <div key={region.id}><span>{region.name}</span><meter min="0" max={list.length} value={done} /> <small>{done}/{list.length}</small></div>;
        })}
      </div>
      <section className="score-box">
        <p>県名の正答率：{rate("nameCorrectCount", "nameWrongCount")}</p>
        <p>位置問題の正答率：{rate("locationCorrectCount", "locationWrongCount")}</p>
        <p>県庁所在地の正答率：{rate("capitalCorrectCount", "capitalWrongCount")}</p>
      </section>
      <PrefectureList items={weak} progress={progress} empty="苦手な県はまだありません。" />
      <button className="danger" onClick={() => { clearProgress(); setProgress(loadProgress()); setPoints(0); }}>学習データを初期化</button>
    </>
  );
}

function CharacterIcon({ prefecture, stage, large = false }: { prefecture: CharacterLike; stage: CharacterStage; large?: boolean }) {
  const [srcIndex, setSrcIndex] = useState(0);
  const stagePath = assetPath(`characters/${prefecture.id}/${stage}.webp`);
  const sources = [stagePath, prefecture.characterImage];
  const src = sources[srcIndex];
  const hidden = stage === "undiscovered";
  const hasImageSource = !!src && srcIndex < sources.length;
  return (
    <div className={`character-icon ${stage} ${large ? "large" : ""}`}>
      {hasImageSource && !hidden ? (
        <img src={src} alt={prefecture.characterName} onError={() => setSrcIndex((index) => index + 1)} />
      ) : hidden ? (
        null
      ) : (
        <span>{prefecture.name.slice(0, 1)}</span>
      )}
      {stage === "friendly" && <i className="effect heart">♥</i>}
      {stage === "buddy" && <i className="effect sparkle">★</i>}
      {stage === "master" && <i className="effect crown">♛</i>}
    </div>
  );
}

export default App;
