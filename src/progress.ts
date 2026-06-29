import { prefectures, type Prefecture } from "./data/prefectures";

export type LearningStatus = "unlearned" | "studied" | "firstCleared" | "reviewWaiting" | "consolidating" | "master";
export type CharacterStage = "undiscovered" | "met" | "friendly" | "buddy" | "master";
export type QuizType = "location" | "name" | "capital" | "reverse";

export type PrefectureProgress = {
  visited: boolean;
  learningStatus: LearningStatus;
  nameCorrectCount: number;
  nameWrongCount: number;
  locationCorrectCount: number;
  locationWrongCount: number;
  capitalCorrectCount: number;
  capitalWrongCount: number;
  lastCorrectAt: string | null;
  lastWrongAt: string | null;
  nextReviewAt: string | null;
  firstClearedAt: string | null;
  reviewSuccessCount: number;
  lastReviewCorrectAt: string | null;
  characterStage: CharacterStage;
  isWeak: boolean;
};

export type ProgressState = Record<string, PrefectureProgress>;

const STORAGE_KEY = "japan-map-character-zukan-progress-v2";
const POINTS_STORAGE_KEY = "japan-map-character-zukan-points-v1";

export const todayString = () => new Date().toISOString().slice(0, 10);

export const addDays = (dateText: string, days: number) => {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

export const createEmptyProgress = (): PrefectureProgress => ({
  visited: false,
  learningStatus: "unlearned",
  nameCorrectCount: 0,
  nameWrongCount: 0,
  locationCorrectCount: 0,
  locationWrongCount: 0,
  capitalCorrectCount: 0,
  capitalWrongCount: 0,
  lastCorrectAt: null,
  lastWrongAt: null,
  nextReviewAt: null,
  firstClearedAt: null,
  reviewSuccessCount: 0,
  lastReviewCorrectAt: null,
  characterStage: "undiscovered",
  isWeak: false,
});

export const createInitialProgress = (): ProgressState =>
  Object.fromEntries(prefectures.map((prefecture) => [prefecture.id, createEmptyProgress()]));

export const normalizeProgress = (raw: unknown): ProgressState => {
  const base = createInitialProgress();
  if (!raw || typeof raw !== "object") return base;
  for (const prefecture of prefectures) {
    const item = (raw as Record<string, Partial<PrefectureProgress>>)[prefecture.id];
    if (item && typeof item === "object") {
      base[prefecture.id] = { ...base[prefecture.id], ...item };
    }
  }
  return base;
};

export const loadProgress = (): ProgressState => {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return normalizeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return createInitialProgress();
  }
};

export const saveProgress = (progress: ProgressState) => {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
};

export const loadPoints = () => {
  try {
    const value = Number(window.localStorage.getItem(POINTS_STORAGE_KEY));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
};

export const savePoints = (points: number) => {
  window.localStorage.setItem(POINTS_STORAGE_KEY, String(Math.max(0, Math.floor(points))));
};

export const getPointCharacterStage = (points: number): CharacterStage => {
  if (points >= 10000) return "master";
  if (points >= 5000) return "buddy";
  if (points >= 3000) return "friendly";
  if (points >= 1000) return "met";
  return "undiscovered";
};

export const clearProgress = () => {
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(POINTS_STORAGE_KEY);
};

export const visitPrefecture = (progress: ProgressState, prefectureId: string): ProgressState => {
  const next = structuredClone(progress);
  const item = next[prefectureId] ?? createEmptyProgress();
  item.visited = true;
  item.characterStage = item.characterStage === "undiscovered" ? "met" : item.characterStage;
  item.learningStatus = item.learningStatus === "unlearned" ? "studied" : item.learningStatus;
  next[prefectureId] = item;
  return next;
};

const correctKey = (quizType: QuizType) => (quizType === "location" ? "locationCorrectCount" : quizType === "capital" || quizType === "reverse" ? "capitalCorrectCount" : "nameCorrectCount");
const wrongKey = (quizType: QuizType) => (quizType === "location" ? "locationWrongCount" : quizType === "capital" || quizType === "reverse" ? "capitalWrongCount" : "nameWrongCount");

const canMaster = (item: PrefectureProgress, today: string) =>
  item.visited &&
  item.locationCorrectCount >= 2 &&
  item.capitalCorrectCount >= 2 &&
  item.nameCorrectCount >= 1 &&
  item.reviewSuccessCount >= 2 &&
  !!item.firstClearedAt &&
  item.firstClearedAt < today &&
  !!item.lastReviewCorrectAt &&
  (!item.lastWrongAt || item.lastWrongAt < item.lastReviewCorrectAt);

export const updateQuizResult = (
  progress: ProgressState,
  prefectureId: string,
  quizType: QuizType,
  isCorrect: boolean,
  isReview: boolean,
): ProgressState => {
  const today = todayString();
  const next = visitPrefecture(progress, prefectureId);
  const item = next[prefectureId];

  if (isCorrect) {
    item[correctKey(quizType)] += 1;
    item.lastCorrectAt = today;
    const isDaySpacedReview = isReview || (!!item.nextReviewAt && item.nextReviewAt <= today && item.firstClearedAt !== today);

    if (!item.firstClearedAt) {
      item.firstClearedAt = today;
      item.learningStatus = "reviewWaiting";
      item.characterStage = "friendly";
      item.nextReviewAt = addDays(today, 1);
    } else if (isDaySpacedReview && item.reviewSuccessCount === 0) {
      item.reviewSuccessCount = 1;
      item.lastReviewCorrectAt = today;
      item.learningStatus = "consolidating";
      item.characterStage = "buddy";
      item.nextReviewAt = addDays(today, 3);
      item.isWeak = false;
    } else if (isDaySpacedReview && item.reviewSuccessCount >= 1) {
      item.reviewSuccessCount += 1;
      item.lastReviewCorrectAt = today;
      item.isWeak = false;
      if (canMaster(item, today)) {
        item.learningStatus = "master";
        item.characterStage = "master";
        item.nextReviewAt = null;
      } else {
        item.learningStatus = "consolidating";
        item.characterStage = "buddy";
        item.nextReviewAt = addDays(today, 3);
      }
    } else if (item.learningStatus === "studied") {
      item.learningStatus = "firstCleared";
      item.characterStage = "friendly";
      item.nextReviewAt = addDays(today, 1);
    }
  } else {
    item[wrongKey(quizType)] += 1;
    item.lastWrongAt = today;
    item.isWeak = true;
    item.learningStatus = "reviewWaiting";
    item.nextReviewAt = addDays(today, 1);
  }

  next[prefectureId] = item;
  return next;
};

export const updateChallengeResult = (
  progress: ProgressState,
  prefectureId: string,
  quizType: QuizType,
  isCorrect: boolean,
): ProgressState => {
  const item = progress[prefectureId];
  if (!item?.visited) return progress;

  const today = todayString();
  const next = structuredClone(progress);
  const nextItem = next[prefectureId];

  if (isCorrect) {
    nextItem[correctKey(quizType)] += 1;
    nextItem.lastCorrectAt = today;
    nextItem.isWeak = false;
  } else {
    nextItem[wrongKey(quizType)] += 1;
    nextItem.lastWrongAt = today;
    nextItem.isWeak = true;
  }

  return next;
};

export const getReviewPrefectures = (progress: ProgressState): Prefecture[] => {
  const today = todayString();
  const score = (prefecture: Prefecture) => {
    const item = progress[prefecture.id];
    if (item.nextReviewAt && item.nextReviewAt <= today) return 0;
    if (item.lastWrongAt) return 1;
    if (item.isWeak) return 2;
    if (item.firstClearedAt && item.learningStatus !== "master" && item.reviewSuccessCount === 0 && item.firstClearedAt < today) return 3;
    if (item.learningStatus !== "master" && item.visited) return 4;
    return 9;
  };
  return prefectures
    .filter((prefecture) => score(prefecture) < 9)
    .sort((a, b) => score(a) - score(b))
    .slice(0, 10);
};

export const statusLabel: Record<LearningStatus, string> = {
  unlearned: "未学習",
  studied: "学習済み",
  firstCleared: "初回クリア",
  reviewWaiting: "復習待ち",
  consolidating: "定着中",
  master: "マスター",
};

export const characterStageLabel: Record<CharacterStage, string> = {
  undiscovered: "未発見",
  met: "出会った",
  friendly: "なかよし",
  buddy: "ともだち",
  master: "マスター",
};
