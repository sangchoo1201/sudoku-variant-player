import {
    type BoardChange, type CompressedBoardChange,
    type CompressedSolvingState,
    CompressedSolvingStateSchema, type Digit, type Position, position_generator,
    type SolvingState,
    SolvingStateSchema
} from "./schema.ts";

function set_to_string(set: Record<string, true>): string {
    let str = "";
    for (const s in set) {
        str += s;
    }
    return str;
}

function string_to_set(str: string): Record<string, true> {
    const set: Record<string, true> = {};
    for (const char of str) {
        set[char] = true;
    }
    return set;
}

function pos_to_number([r, c]: Position): number {
    return (r + 1) * 10 + (c + 1);
}

function number_to_pos(n: number): Position {
    const r = Math.floor(n / 10) - 1;
    const c = n % 10 - 1;
    return [r, c] as Position;
}

function compress_pos(pos: Position[]): number | string {
    if (pos.length <= 8) {
        let n = 0;
        for (const p of pos) {
            n *= 100;
            n += pos_to_number(p);
        }
        return n;
    }

    const set = new Set<number>(pos.map(pos_to_number));
    const bits: boolean[] = [];
    for (const p of position_generator()) {
        bits.push(set.has(pos_to_number(p)));
    }
    const bytes = new Uint8Array(11);
    for (let i = 0; i < 81; i++) {
        if (bits[i]) {
            bytes[i >> 3] |= 1 << (i & 7);
        }
    }

    let binary = "";
    for (const b of bytes) {
        binary += String.fromCharCode(b);
    }

    return btoa(binary);
}

function extract_pos(value: number | string): Position[] {
    const pos: Position[] = [];
    if (typeof value === "number") {
        while (value > 0) {
            pos.push(number_to_pos(value % 100));
            value = Math.floor(value / 100);
        }
        return pos;
    }

    const binary = atob(value);
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));

    let i = 0;
    for (const p of position_generator()) {
        if ((bytes[i >> 3] >> (i & 7) & 1) !== 0) {
            pos.push(p);
        }
        i++;
    }

    return pos;
}

const memo_change_to_number = { "corner": 1, "center": 2, "color": 3 } as const;
const memo_delete_to_number = { "corner": 4, "center": 5, "color": 6 } as const;

function compress_board_change(change: BoardChange): CompressedBoardChange {
    if (change.type === "normal") {
        return [
            0,
            change.before.map(({ pos, number }) => pos_to_number(pos) * 10 + (number ?? 0)),
            change.after ?? 0,
        ];
    } else if (change.delete) {
        return [
            memo_delete_to_number[change.type],
            change.before.map(({ pos, memo }) =>
                [pos_to_number(pos), set_to_string(memo)] as [number, string]),
        ];
    } else {
        return [
            memo_change_to_number[change.type],
            compress_pos(change.pos),
            change.memo,
        ];
    }
}

const number_to_memo_change = {
    1: "corner",
    2: "center",
    3: "color",
} as const;

const number_to_memo_delete = {
    4: "corner",
    5: "center",
    6: "color",
} as const;

function extract_board_change(change: CompressedBoardChange): BoardChange {
    if (change[0] === 0) {
        return {
            type: "normal",
            before: change[1].map(x => ({
                pos: number_to_pos(Math.floor(x / 10)),
                number: x % 10 === 0 ? null : (x % 10 as Digit),
            })),
            after: change[2] === 0 ? null : change[2],
        };
    } else if (change[0] === 1 || change[0] === 2 || change[0] === 3) {
        return {
            type: number_to_memo_change[change[0]],
            delete: false,
            pos: extract_pos(change[1]),
            memo: change[2],
        };
    } else if (change[0] === 4 || change[0] === 5 || change[0] === 6) {
        return {
            type: number_to_memo_delete[change[0]],
            delete: true,
            before: change[1].map(x => ({
                pos: number_to_pos(x[0]),
                memo: string_to_set(x[1]),
            })),
        };
    }

    throw new Error("unreachable");
}

export function save_state(puzzle_id: string, solving_state: SolvingState) {
    if (puzzle_id === "#00000") return;
    const key = `sudoku_variant_${puzzle_id}`;

    const compressed: CompressedSolvingState = [
        // board
        solving_state.board.map(row => row.map(cell => {
            if (cell.fixed) {
                return [
                    cell.number,
                    set_to_string(cell.color),
                ];
            } else {
                return [
                    cell.number ?? 0,
                    set_to_string(cell.corner),
                    set_to_string(cell.center),
                    set_to_string(cell.color),
                ];
            }
        })),
        // undo
        solving_state.undo.map(compress_board_change),
        // redo
        solving_state.redo.map(compress_board_change),
    ]

    const keys = JSON.parse(localStorage.getItem("sudoku_variant_history") ?? "[]") as string[];
    if (keys.includes(key)) {
        keys.splice(keys.indexOf(key), 1);
    }
    keys.push(key);
    while (true) {
        try {
            localStorage.setItem(key, JSON.stringify(compressed));
            localStorage.setItem("sudoku_variant_history", JSON.stringify(keys));
            break;
        } catch (e) {
            const old_key = keys.shift()!;
            localStorage.removeItem(old_key);
        }
    }
}

export function load_state(puzzle_id: string): SolvingState | null {
    const key = `sudoku_variant_${puzzle_id}`;
    const data = localStorage.getItem(key);
    if (data === null) return null;

    let parsed_data: unknown;
    try {
        parsed_data = JSON.parse(data);
    } catch (_) {
        return null;
    }

    const result = SolvingStateSchema.safeParse(parsed_data);
    if (result.success) return result.data;

    const compressed_result = CompressedSolvingStateSchema.safeParse(parsed_data);
    if (!compressed_result.success) return null;

    const compressed_data = compressed_result.data;
    return {
        board: compressed_data[0].map(row => row.map(cell => {
            if (cell.length === 2) {
                return {
                    fixed: true,
                    number: cell[0],
                    color: string_to_set(cell[1]),
                };
            } else {
                return {
                    fixed: false,
                    number: cell[0] === 0 ? null : cell[0],
                    corner: string_to_set(cell[1]),
                    center: string_to_set(cell[2]),
                    color: string_to_set(cell[3]),
                };
            }
        })),
        undo: compressed_data[1].map(extract_board_change),
        redo: compressed_data[2].map(extract_board_change),
    };
}