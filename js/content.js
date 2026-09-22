import { round, score } from './score.js';

/**
 * Data folder for GitHub Pages
 */
const dir = '/Friend-Group-Demonlist/data';

export async function fetchList() {
    try {
        const listResult = await fetch(`${dir}/_list.json`);

        if (!listResult.ok) {
            throw new Error(
                `Failed to load _list.json: ${listResult.status}`,
            );
        }

        const list = await listResult.json();

        return await Promise.all(
            list.map(async (path, rank) => {
                try {
                    const levelResult = await fetch(
                        `${dir}/${path}.json`,
                    );

                    if (!levelResult.ok) {
                        throw new Error(
                            `HTTP ${levelResult.status}`,
                        );
                    }

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
                } catch (error) {
                    console.error(
                        `Failed to load level #${rank + 1} ${path}.`,
                        error,
                    );

                    return [null, path];
                }
            }),
        );
    } catch (error) {
        console.error('Failed to load list.', error);
        return null;
    }
}

export async function fetchEditors() {
    try {
        const editorsResults = await fetch(
            `${dir}/_editors.json`,
        );

        if (!editorsResults.ok) {
            return null;
        }

        return await editorsResults.json();
    } catch {
        return null;
    }
}

function getLevelScore(level, rank, percent) {
    // Use normal scoring if custom points aren't specified
    if (level.points == null) {
        return score(
            rank,
            percent,
            level.percentToQualify,
        );
    }

    // Full completion
    if (percent === 100) {
        return round(level.points);
    }

    // Below minimum percentage
    if (percent < level.percentToQualify) {
        return 0;
    }

    // Partial progress
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

        // ----------------
        // VERIFIER
        // ----------------

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

        scoreMap[verifier].verified.push({
            rank: levelRank,
            level: level.name,
            score: getLevelScore(
                level,
                levelRank,
                100,
            ),
            link: level.verification,
        });

        // ----------------
        // VICTORS
        // ----------------

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

            if (record.percent === 100) {
                scoreMap[user].completed.push({
                    rank: levelRank,
                    level: level.name,

                    score: getLevelScore(
                        level,
                        levelRank,
                        100,
                    ),

                    link: record.link,

                    firstVictor:
                        level.firstVictor?.toLowerCase() ===
                        record.user.toLowerCase(),
                });

                return;
            }

            scoreMap[user].progressed.push({
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
                    (total, record) =>
                        total + record.score,
                    0,
                );

            return {
                user,
                total: round(total),
                ...scores,
            };
        },
    );

    return [
        res.sort(
            (a, b) => b.total - a.total,
        ),
        errs,
    ];
}
