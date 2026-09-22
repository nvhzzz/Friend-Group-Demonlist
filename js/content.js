import { round, score } from './score.js';

/**
 * Path to the data folder.
 * This works correctly on GitHub Pages even when the
 * site is hosted inside a repository folder.
 */
const dir = new URL('../data/', import.meta.url);

/**
 * Fetch all levels from _list.json
 */
export async function fetchList() {
    const listResult = await fetch(
        new URL('_list.json', dir),
    );

    try {
        const list = await listResult.json();

        return await Promise.all(
            list.map(async (path, rank) => {
                const levelResult = await fetch(
                    new URL(`${path}.json`, dir),
                );

                try {
                    const level = await levelResult.json();

                    return [
                        {
                            ...level,
                            path,
                            records: (level.records ?? []).sort(
                                (a, b) =>
                                    b.percent - a.percent,
                            ),
                        },
                        null,
                    ];
                } catch {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}.`,
                    );

                    return [null, path];
                }
            }),
        );
    } catch {
        console.error(`Failed to load list.`);
        return null;
    }
}

/**
 * Fetch list editors
 */
export async function fetchEditors() {
    try {
        const editorsResults = await fetch(
            new URL('_editors.json', dir),
        );

        const editors = await editorsResults.json();

        return editors;
    } catch {
        return null;
    }
}

/**
 * Get the points awarded for a level.
 *
 * If the level JSON contains "points", that value
 * will be used for a 100% completion.
 *
 * Otherwise, the normal score.js formula is used.
 */
function getLevelScore(level, rank, percent) {
    // No custom points = use original formula
    if (level.points == null) {
        return score(
            rank,
            percent,
            level.percentToQualify,
        );
    }

    // Full completion gets all custom points
    if (percent === 100) {
        return round(level.points);
    }

    // Below minimum percentage = no points
    if (percent < level.percentToQualify) {
        return 0;
    }

    // Calculate partial-progress points
    const progress =
        (percent - (level.percentToQualify - 1)) /
        (100 - (level.percentToQualify - 1));

    return round(
        Math.max(
            0,
            level.points * progress * (2 / 3),
        ),
    );
}

/**
 * Build player leaderboard
 */
export async function fetchLeaderboard() {
    const list = await fetchList();

    if (!list) {
        return [[], []];
    }

    const scoreMap = {};
    const errs = [];

    list.forEach(([level, err], rank) => {
        if (err) {
            errs.push(err);
            return;
        }

        const levelRank = rank + 1;

        // --------------------
        // VERIFIER
        // --------------------

        const verifier =
            Object.keys(scoreMap).find(
                (u) =>
                    u.toLowerCase() ===
                    level.verifier.toLowerCase(),
            ) || level.verifier;

        scoreMap[verifier] ??= {
            verified: [],
            completed: [],
            progressed: [],
        };

        const { verified } = scoreMap[verifier];

        verified.push({
            rank: levelRank,
            level: level.name,

            score: getLevelScore(
                level,
                levelRank,
                100,
            ),

            link: level.verification,
        });

        // --------------------
        // RECORDS / VICTORS
        // --------------------

        level.records.forEach((record) => {
            const user =
                Object.keys(scoreMap).find(
                    (u) =>
                        u.toLowerCase() ===
                        record.user.toLowerCase(),
                ) || record.user;

            scoreMap[user] ??= {
                verified: [],
                completed: [],
                progressed: [],
            };

            const {
                completed,
                progressed,
            } = scoreMap[user];

            // 100% completion
            if (record.percent === 100) {
                completed.push({
                    rank: levelRank,
                    level: level.name,

                    score: getLevelScore(
                        level,
                        levelRank,
                        100,
                    ),

                    link: record.link,

                    // Marks this completion as the first victor
                    firstVictor:
                        level.firstVictor?.toLowerCase() ===
                        record.user.toLowerCase(),
                });

                return;
            }

            // Partial progress
            progressed.push({
                rank: levelRank,
                level: level.name,
                percent: record.percent,

                score: getLevelScore(
                    level,
                    levelRank,
                    record.percent,
                ),

                link: record.link,
            });
        });
    });

    // --------------------
    // BUILD LEADERBOARD
    // --------------------

    const res = Object.entries(scoreMap).map(
        ([user, scores]) => {
            const {
                verified,
                completed,
                progressed,
            } = scores;

            const total = [
                verified,
                completed,
                progressed,
            ]
                .flat()
                .reduce(
                    (prev, cur) =>
                        prev + cur.score,
                    0,
                );

            return {
                user,
                total: round(total),
                ...scores,
            };
        },
    );

    // Highest score first
    return [
        res.sort(
            (a, b) =>
                b.total - a.total,
        ),
        errs,
    ];
}
