import { type SolvingState, type BoardState, type PuzzleData, PuzzleDataSchema } from "./schema.ts";
import {render_all} from "./render.ts";
import {setup_selection} from "./input.ts";

const default_data: PuzzleData = {
    id: "#00000",
    difficulty: 0,
    board: Array.from({ length: 9 }, () => Array(9).fill(0)),
    rules: [
        {
            id: "[Sudoku]",
        },
        {
            id: "[R]",
        },
        {
            id: "[C]",
        },
        {
            id: "[B]",
        },
    ]
};

function base64_decode_or_null(base64: string): string | null {
    const base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
    if (base64Regex.test(base64)) { return atob(base64); }
    return null;
}

function json_decode_or_null(json: string): any {
    try {
        return JSON.parse(json);
    } catch (e) {
        return null;
    }
}

function parse_data(code: string | null): object {
    if (code == null) { return {}; }
    const base64_data = decodeURIComponent(code);
    const json_data = base64_decode_or_null(base64_data);
    if (json_data == null) { return {}; }
    const data = json_decode_or_null(json_data);
    if (data == null || !(data instanceof Object)) { return {}; }
    return data;
}

function generate_default_solving_state(puzzle_data: PuzzleData): SolvingState {
    const board_state: BoardState = []
    for (const [i, row] of puzzle_data.board.entries()) {
        board_state.push([])
        for (const [_, value] of row.entries()) {
            if (value == 0) {
                board_state[i].push({
                    fixed: false,
                    number: null,
                    corner: {},
                    center: {},
                });
            } else {
                board_state[i].push({
                    fixed: true,
                    number: value,
                });
            }
        }
    }

    return {
        board: board_state,
        undo: [],
        redo: [],
    }
}

const grid = document.getElementById('grid')!;
const main_grid = document.getElementById('main-grid')!;
const right_clue = document.getElementById('right-clues')!;
const bottom_clue = document.getElementById('bottom-clues')!;
const corner_order = [0, 4, 1, 6, 8, 7, 2, 5, 3] as const;

export type CellType = {
    cell: HTMLDivElement,
    normal: HTMLDivElement,
    corner: HTMLDivElement[],
    center: HTMLDivElement,
}

function setup_grid(puzzle_data: PuzzleData) {
    let mx_side_length = 0;
    for (const rule of puzzle_data.rules) {
        if (rule.id === "[QT]" || rule.id === "[RG]" || rule.id === "[SQ]") {
            for (const [_dir, _idx, numbers] of rule.render_state.side_hints) {
                mx_side_length = Math.max(mx_side_length, numbers.length);
            }
        }
    }
    const mx_resize = mx_side_length / 2.8;
    const side_size = `${mx_resize * 100 / (mx_resize + 9)}%`;
    const main_size = `${900 / (mx_resize + 9)}%`


    grid.style.width = main_size;
    grid.style.height = main_size;
    right_clue.style.width = side_size;
    right_clue.style.height = main_size;
    bottom_clue.style.width = main_size;
    bottom_clue.style.height = side_size;

    const cell_map: CellType[][] = [];
    for (let r = 0; r < 9; r++) {
        cell_map[r] = [];
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            main_grid.appendChild(cell);

            const normal = document.createElement('div');
            normal.classList.add('normal');
            cell.appendChild(normal);

            const corner = document.createElement('div');
            corner.classList.add('corner');
            cell.appendChild(corner);

            const corner_cells: HTMLDivElement[] = [];
            for (let i = 0; i < 9; i++) {
                const corner_inner = document.createElement('div');
                corner_cells[corner_order[i]] = corner_inner;
                corner.appendChild(corner_inner);
            }

            const center = document.createElement('div');
            center.classList.add('center');
            cell.appendChild(center);

            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            const value = puzzle_data.board[r][c];
            if (value === 0) {
                normal.textContent = '';
            } else {
                normal.textContent = value.toString();
                cell.classList.add('fixed');
            }

            cell_map[r][c] = {
                cell: cell,
                normal: normal,
                corner: corner_cells,
                center: center,
            };
        }
    }
    return cell_map;
}

const query_string = window.location.search;
const url_params = new URLSearchParams(query_string);
const code = url_params.get('code');
const parsed_data = parse_data(code);
const result = PuzzleDataSchema.safeParse(parsed_data);
const puzzle_data: PuzzleData = result.success ? result.data : default_data;
const solving_state: SolvingState = puzzle_data.solving_state || generate_default_solving_state(puzzle_data);

const cell_map = setup_grid(puzzle_data);
render_all(puzzle_data.rules);
setup_selection(cell_map, solving_state, puzzle_data.rules);

window.getSelection()?.selectAllChildren(document.body);

if (import.meta.env.DEV) {
    (globalThis as any).main = { solving_state }
}