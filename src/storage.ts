import {
    type BoardChange, type CompressedBoardChange,
    type CompressedSolvingState,
    CompressedSolvingStateSchema,
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

const memo_to_number = {
    "corner": 1,
    "center": 2,
    "color": 3,
} as const;

function compress_board_change(changes: BoardChange): CompressedBoardChange {
    if (changes.type === "normal") {
        return [0, changes.change.map(change => [
            change.pos[0],
            change.pos[1],
            change.before ?? 0,
            change.after ?? 0,
        ])];
    } else {
        return [memo_to_number[changes.type], changes.change.map(change => [
            change.pos[0],
            change.pos[1],
            set_to_string(change.before),
            set_to_string(change.after),
        ])];
    }
}

const number_to_memo = {
    1: "corner",
    2: "center",
    3: "color",
} as const;

function extract_board_change(changes: CompressedBoardChange): BoardChange {
    if (changes[0] === 0) {
        return {
            type: "normal",
            change: changes[1].map(change => ({
                pos: [change[0], change[1]],
                before: change[2] === 0 ? null : change[2],
                after: change[3] === 0 ? null : change[3],
            })),
        };
    } else {
        return {
            type: number_to_memo[changes[0]],
            change: changes[1].map(change => ({
                pos: [change[0], change[1]],
                before: string_to_set(change[2]),
                after: string_to_set(change[3]),
            })),
        };
    }
}

export function save_state(puzzle_id: string, solving_state: SolvingState) {
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
        [],
        // redo
        [],
    ]

    localStorage.setItem(key, JSON.stringify(compressed));
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
        undo: [],
        redo: [],
    };
}