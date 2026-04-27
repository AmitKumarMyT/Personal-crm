/**
 * Learning Engine Utilities
 * Handles DSA problem selection and difficulty adaptation.
 */

export interface Question {
  id: string;
  title: string;
  topic: string;
  difficulty: 'easy' | 'medium' | 'hard';
  source: string;
  link: string;
  tags: string[];
}

export interface Attempt {
  id: string;
  questionId: string;
  date: string;
  timeTaken: number; // minutes
  difficultyFelt: number; // 1-5
  solved: boolean;
}

/**
 * Calculate performance score for difficulty adaptation
 * Returns a value where lower is worse (needs easier problems) and higher is better.
 */
export function calculatePerformanceScore(attempt: Attempt, expectedTime: number = 45): number {
  const solvedScore = attempt.solved ? 1 : 0;
  const timeScore = Math.max(0, 1 - (attempt.timeTaken / expectedTime));
  const feelScore = (6 - attempt.difficultyFelt) / 5; // Lower felt difficulty is better

  return (solvedScore * 0.5) + (timeScore * 0.25) + (feelScore * 0.25);
}

/**
 * Adaptive selection distribution
 * 60% weak, 30% medium, 10% hard (suggested by prompt)
 */
export function getRecommendedDifficulty(averageScore: number): 'easy' | 'medium' | 'hard' {
  if (averageScore < 0.4) return 'easy';
  if (averageScore < 0.7) return 'medium';
  return 'hard';
}

/**
 * Group attempts by topic to find weak areas
 */
export function analyzeTopics(questions: Question[], attempts: Attempt[]) {
  const topicStats: Record<string, { solved: number; total: number; avgTime: number }> = {};

  attempts.forEach(attempt => {
    const q = questions.find(q => q.id === attempt.questionId);
    if (!q) return;

    if (!topicStats[q.topic]) {
      topicStats[q.topic] = { solved: 0, total: 0, avgTime: 0 };
    }

    const stats = topicStats[q.topic];
    if (attempt.solved) stats.solved++;
    stats.total++;
    stats.avgTime = (stats.avgTime * (stats.total - 1) + attempt.timeTaken) / stats.total;
  });

  return topicStats;
}
