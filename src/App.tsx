import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { BarChart3, Home, Map, RotateCcw, Sparkles } from "lucide-react";
import { assetPath } from "./assetPath";
import { prefectureByCode, prefectureById, prefectures, regions, type Prefecture, type RegionId } from "./data/prefectures";
import {
  characterStageLabel,
  clearProgress,
  getReviewPrefectures,
  loadProgress,
  saveProgress,
  statusLabel,
  todayString,
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

const navigate = (path: string) => {
  window.history.pushState(null, "", path);
  window.dispatchEvent(new Event("popstate"));
  window.scrollTo({ top: 0 });
};

const useRoute = (): Route => {
  const [route, setRoute] = useState<Route>({ path: window.location.pathname, query: new URLSearchParams(window.location.search) });
  useEffect(() => {
    const update = () => setRoute({ path: window.location.pathname, query: new URLSearchParams(window.location.search) });
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

function App() {
  const route = useRoute();
  const [progress, setProgress] = useState<ProgressState>(() => loadProgress());

  useEffect(() => saveProgress(progress), [progress]);

  const setAndSave = (next: ProgressState) => setProgress(next);
  const reviewPrefectures = useMemo(() => getReviewPrefectures(progress), [progress]);

  const page = (() => {
    if (route.path === "/map") return <MapPage progress={progress} />;
    if (route.path.startsWith("/region/")) return <RegionPage id={decodeURIComponent(route.path.split("/").pop() ?? "") as RegionId} progress={progress} />;
    if (route.path.startsWith("/prefecture/")) return <PrefecturePage id={route.path.split("/").pop() ?? ""} progress={progress} setProgress={setAndSave} />;
    if (route.path === "/quiz") return <QuizPage query={route.query} progress={progress} setProgress={setAndSave} />;
    if (route.path === "/review") return <ReviewPage progress={progress} />;
    if (route.path === "/dex") return <CharacterDexPage progress={progress} />;
    if (route.path === "/stats") return <StatsPage progress={progress} setProgress={setAndSave} />;
    return <HomePage progress={progress} reviewPrefectures={reviewPrefectures} />;
  })();

  return (
    <div className="app-shell">
      <main className="page">{page}</main>
      <BottomNavigation />
    </div>
  );
}

function BottomNavigation() {
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
        <button key={path} className={window.location.pathname === path ? "active" : ""} onClick={() => navigate(path)}>
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

function HomePage({ progress, reviewPrefectures }: { progress: ProgressState; reviewPrefectures: Prefecture[] }) {
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
        <button className="secondary-action" onClick={() => navigate("/map")}>新しい地方を学ぶ</button>
      </section>
      <section className="stats-strip">
        <Metric label="集めたキャラ" value={`${collected}/47`} />
        <Metric label="マスター" value={`${mastered}/47`} />
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

function JapanMap({ progress, onSelect, highlightId }: { progress: ProgressState; onSelect: (id: string) => void; highlightId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [svgMarkup, setSvgMarkup] = useState("");

  useEffect(() => {
    const isMobile = window.matchMedia("(max-width: 680px)").matches;
    fetch(assetPath(isMobile ? "maps/map-mobile.svg" : "maps/map-full.svg"))
      .then((response) => response.text())
      .then(setSvgMarkup)
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
      const status = highlightId === prefecture.id ? "highlight" : item.isWeak ? "weak" : item.learningStatus === "master" ? "master" : item.visited ? "visited" : "new";
      element.classList.remove("new", "visited", "weak", "master", "highlight");
      element.classList.add("map-pref", status);
      element.setAttribute("role", "button");
      element.setAttribute("tabindex", "0");
      element.setAttribute("aria-label", prefecture.name);
      if (!element.querySelector(".prefecture-hit-area")) {
        const box = element.getBBox();
        const hitArea = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hitArea.setAttribute("class", "prefecture-hit-area");
        hitArea.setAttribute("x", String(box.x));
        hitArea.setAttribute("y", String(box.y));
        hitArea.setAttribute("width", String(box.width));
        hitArea.setAttribute("height", String(box.height));
        element.appendChild(hitArea);
      }
      element.onclick = () => onSelect(prefecture.id);
      element.onkeydown = (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(prefecture.id);
        }
      };
    });

    const selectFromEvent = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<SVGGElement>(".prefecture[data-code]") : null;
      const code = target?.dataset.code;
      const prefecture = code ? prefectureByCode[code] : undefined;
      if (prefecture) onSelect(prefecture.id);
    };
    const selectFromKeyboard = (event: Event) => {
      if (!(event instanceof window.KeyboardEvent) || (event.key !== "Enter" && event.key !== " ")) return;
      const target = event.target instanceof Element ? event.target.closest<SVGGElement>(".prefecture[data-code]") : null;
      const code = target?.dataset.code;
      const prefecture = code ? prefectureByCode[code] : undefined;
      if (prefecture) {
        event.preventDefault();
        onSelect(prefecture.id);
      }
    };
    container.addEventListener("click", selectFromEvent);
    container.addEventListener("keydown", selectFromKeyboard);
    return () => {
      container.removeEventListener("click", selectFromEvent);
      container.removeEventListener("keydown", selectFromKeyboard);
    };
  }, [svgMarkup, progress, highlightId, onSelect]);

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = (event.target as Element).closest<SVGGElement>(".prefecture[data-code]");
    const code = target?.dataset.code;
    const prefecture = code ? prefectureByCode[code] : undefined;
    if (prefecture) onSelect(prefecture.id);
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
      {mode === "location" || mode === "name" ? <JapanMap progress={progress} highlightId={mode === "name" ? target.id : undefined} onSelect={(id) => mode === "location" && submit(prefectureById[id].name)} /> : null}
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

function CharacterDexPage({ progress }: { progress: ProgressState }) {
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
      </div>
    </>
  );
}

function StatsPage({ progress, setProgress }: { progress: ProgressState; setProgress: (progress: ProgressState) => void }) {
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
      <button className="danger" onClick={() => { clearProgress(); setProgress(loadProgress()); }}>学習データを初期化</button>
    </>
  );
}

function CharacterIcon({ prefecture, stage, large = false }: { prefecture: Prefecture; stage: CharacterStage; large?: boolean }) {
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
