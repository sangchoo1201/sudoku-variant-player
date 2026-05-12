import {
    type SolvingState,
    type BoardState,
    type PuzzleData,
    PuzzleDataSchema,
    type DirectionExtended, SolvingStateSchema
} from "./schema.ts";
import {render_all} from "./render.ts";
import {redirect_puzzle_id, setup_listeners} from "./input.ts";
import {init_all, modify_all} from "./cell.ts";
import {trail_sat_init} from "./sat.ts";

const default_data: PuzzleData = {
    id: "#00000",
    difficulty: 0,
    board: Array.from({length: 9}, () => Array(9).fill(0)),
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
    if (base64Regex.test(base64)) {
        return atob(base64);
    }
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
    if (code == null) {
        return {};
    }
    const base64_data = decodeURIComponent(code);
    const json_data = base64_decode_or_null(base64_data);
    if (json_data == null) {
        return {};
    }
    const data = json_decode_or_null(json_data);
    if (data == null || !(data instanceof Object)) {
        return {};
    }
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
                    color: {},
                });
            } else {
                board_state[i].push({
                    fixed: true,
                    number: value,
                    color: {},
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
const left_clue = document.getElementById('left-clues')!;
const right_clue = document.getElementById('right-clues')!;
const top_clue = document.getElementById('top-clues')!;
const bottom_clue = document.getElementById('bottom-clues')!;
const memo_color = document.getElementById('memo-color')!;
const corner_order = [0, 4, 1, 6, 8, 7, 2, 5, 3] as const;

export type CellType = {
    cell: HTMLDivElement,
    normal: HTMLDivElement,
    corner: HTMLDivElement[],
    center: HTMLDivElement,
    color: SVGGElement,
}

function setup_grid(puzzle_data: PuzzleData): [CellType[][], HTMLDivElement[], HTMLDivElement[], HTMLDivElement[], HTMLDivElement[]] {
    const mx_lengths: Record<DirectionExtended, number> = {
        "ROW_LEFT": 0,
        "ROW": 0,
        "COL_TOP": 0,
        "COL": 0,
    };
    const length_to_size: Record<DirectionExtended, (n: number) => number> = {
        "ROW_LEFT": n => n === 0 ? 0 : (n / 4) + 0.25,
        "ROW": n => n === 0 ? 0 : (n / 4) + 0.25,
        "COL_TOP": n => n === 0 ? 0 : (n / 2.8) + 0.25,
        "COL": n => n === 0 ? 0 : (n / 2.8) + 0.25,
    } as const;

    for (const rule of puzzle_data.rules) {
        if (rule.id === "[QT]" || rule.id === "[RG]" || rule.id === "[SQ]") {
            for (const [dir, _idx, numbers] of rule.render_state.side_hints) {
                mx_lengths[dir] = Math.max(mx_lengths[dir], numbers.length);
            }
        }
        if (rule.id === "[PD]") {
            for (const [dir, _idx, number] of rule.render_state.side_hints) {
                let len = (number.toString().length + 1) / 2;
                if (dir === "COL" || dir === "COL_TOP") len = 1;
                mx_lengths[dir] = Math.max(mx_lengths[dir], len);
            }
        }
    }

    const side_size: Record<DirectionExtended, number> = Object.fromEntries(
        (["ROW_LEFT", "ROW", "COL_TOP", "COL"] as DirectionExtended[])
            .map(direction => [direction, length_to_size[direction](mx_lengths[direction])])
    ) as Record<DirectionExtended, number>;

    const total_width_size = 9 + side_size["ROW"] + side_size["ROW_LEFT"];
    const total_height_size = 9 + side_size["COL"] + side_size["COL_TOP"];

    const main_size = 9 / Math.max(total_width_size, total_height_size);
    const main_size_string = `${main_size * 100}%`;
    grid.style.width = main_size_string;
    grid.style.height = main_size_string;

    const cx = (4.5 + side_size["ROW_LEFT"]) / total_width_size;
    const cy = (4.5 + side_size["COL_TOP"]) / total_height_size;
    grid.style.top = `${cx * 100}%`;
    grid.style.left = `${cy * 100}%`;

    for (const [side_clue, direction] of [
        [left_clue, "ROW_LEFT"],
        [right_clue, "ROW"],
        [top_clue, "COL_TOP"],
        [bottom_clue, "COL"],
    ] as [HTMLElement, DirectionExtended][]) {
        if (direction.startsWith("ROW")) {
            const width = side_size[direction] / total_width_size;
            side_clue.style.width = `${width * 100}%`;
            side_clue.style.height = main_size_string;
            side_clue.style.top = `${cy * 100}%`;
            if (direction === "ROW_LEFT") side_clue.style.right = `${(cx + main_size / 2) * 100}%`;
            if (direction === "ROW") side_clue.style.left = `${(cx + main_size / 2) * 100}%`;
        }
        if (direction.startsWith("COL")) {
            const height = side_size[direction] / total_height_size;
            side_clue.style.width = main_size_string;
            side_clue.style.height = `${height * 100}%`;
            side_clue.style.left = `${cx * 100}%`;
            if (direction === "COL_TOP") side_clue.style.bottom = `${(cy + main_size / 2) * 100}%`;
            if (direction === "COL") side_clue.style.top = `${(cy + main_size / 2) * 100}%`;
        }
    }

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

            const value = puzzle_data.board[r][c];
            if (value === 0) {
                normal.textContent = '';
            } else {
                normal.textContent = value.toString();
                cell.classList.add('fixed');
            }

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

            const g = document.createElementNS(
                'http://www.w3.org/2000/svg',
                'g'
            );
            g.setAttribute('transform', `translate(${c} ${r})`);
            g.setAttribute('clip-path', 'url(#cell-clip)');
            memo_color.appendChild(g);

            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            cell_map[r][c] = {
                cell: cell,
                normal: normal,
                corner: corner_cells,
                center: center,
                color: g,
            };
        }
    }

    const left: HTMLDivElement[] = [];
    const right: HTMLDivElement[] = [];
    const top: HTMLDivElement[] = [];
    const bottom: HTMLDivElement[] = [];

    for (const [side_clue, side_list] of [
        [left_clue, left],
        [right_clue, right],
        [top_clue, top],
        [bottom_clue, bottom],
    ] as [HTMLElement, HTMLDivElement[]][]) {
        for (let i = 0; i < 9; i++) {
            const div = document.createElement('div');
            div.classList.add('side');
            side_clue.appendChild(div);
            side_list.push(div);
        }
    }

    return [cell_map, left, right, top, bottom];
}

async function main() {
    const query_string = window.location.search;
    const url_params = new URLSearchParams(query_string);
    const id = url_params.get('id');
    if (id !== null) {
        const match = id.match(/^#?(\d+)$/);
        if (match !== null) {
            await redirect_puzzle_id(match[1], true);
            return;
        }
    }
    const code = url_params.get('code');
    const parsed_data = parse_data(code);
    const result = PuzzleDataSchema.safeParse(parsed_data);
    if (!result.success && code !== null) {
        alert("invalid code or variant not updated");
    }
    const puzzle_data: PuzzleData = result.success ? result.data : default_data;
    let solving_state: SolvingState;
    if (puzzle_data.solving_state !== undefined) {
        solving_state = puzzle_data.solving_state;
    } else {
        solving_state = generate_default_solving_state(puzzle_data);
        const key = `sudoku_variant_${puzzle_data.id}`;
        const data = localStorage.getItem(key);
        if (data !== null) {
            const result = SolvingStateSchema.safeParse(JSON.parse(data));
            if (result.success) {
                solving_state = result.data;
            }
        }
    }

    const [cell_map, left, right, top, bottom] = setup_grid(puzzle_data);
    init_all(cell_map, left, right, top, bottom, solving_state, puzzle_data.rules, puzzle_data.id);
    render_all(puzzle_data.rules);
    setup_listeners(solving_state);
    for (const rule of puzzle_data.rules) {
        if (rule.id === "[TR]") {
            trail_sat_init(rule.render_state.start, rule.render_state.end);
        }
    }
    modify_all();

    document.title = `${puzzle_data.id} (sudoku-variant)`;
    for (const button of document.querySelectorAll('button')) {
        button.tabIndex = -1;
    }
    window.getSelection()?.selectAllChildren(document.body);
}

await main();
