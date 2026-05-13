import {
    type SolvingState,
    type BoardState,
    type PuzzleData,
    PuzzleDataSchema,
    type DirectionExtended, type RuleID,
} from "./schema.ts";
import {render_all} from "./render.ts";
import {redirect_puzzle_id, setup_listeners} from "./input.ts";
import {init_all, modify_all, open_info} from "./cell.ts";
import {trail_sat_init} from "./sat.ts";
import {load_state} from "./storage.ts";

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

const side_description = " (보드 바깥의 숫자는 다른 규칙들과 무관합니다)";
const rule_description: Record<RuleID, string> = {
    "[Sudoku]": "스도쿠: 보드판의 모든 칸에 1~9 숫자를 채워야 합니다.",
    "[R]": "가로열: 보드판의 가로줄에는 같은 숫자가 중복할 수 없습니다.",
    "[C]": "세로열: 보드판의 세로줄에는 같은 숫자가 중복할 수 없습니다.",
    "[B]": "박스: 보드판에서 굵은 실선으로 구분된 박스 내부에는 같은 숫자가 중복할 수 없습니다.",

    "[DT]": "디스턴트: 가로 / 세로 / 대각선으로 인접한 칸에 같은 숫자가 중복할 수 없습니다.",
    "[SG]": "세그먼트: 굵은 실선으로 구분된 세그먼트 내에는 같은 숫자가 중복할 수 없습니다.",
    "[LK]": "링크: 마름모 모양으로 연결된 두 칸의 숫자는 반드시 1 차이 나야 합니다.",
    "[LO]": "로터스: 동그라미 표시 된 칸은 상하좌우로 인접한 칸의 숫자들 모두보다 값이 크거나 모두보다 작습니다.",
    "[MR]": "메트로: 색선으로 표시된 노선 위의 모든 숫자는 순서에 상관없이 중복 없는 연속된 숫자들로 이루어져야 합니다.",

    "[SQ]": "시퀀스: 보드 바깥에 주어진 적색 숫자들은 해당 줄에서 등장하는 숫자가 표시된 순서와 동일합니다." + side_description,
    "[QT]": "퀀텀: 보드판 바깥에 녹색 숫자 'X Y'가 주어지면, 해당 줄에서 'X번째 숫자가 Y' 및 'Y번째 숫자가 X' 중 정확히 하나가 성립합니다." + side_description,
    "[RG]": "레인지: 보드 바깥에 주어진 청색 숫자들은 해당 줄에서 '1'과 '9' 사이의 거리를 나타냅니다." + side_description,
    "[QD]": "쿼드: 어떤 2×2 영역을 잡아도, 4개의 숫자 중 홀수와 짝수가 각각 하나 이상 존재합니다.",
    "[RF]": "레퍼런스: 굵은 적색 선으로 표시된 줄이 X번째 줄일 때, 그 줄의 숫자 Y가 있는 칸에서 직교하는 줄의 Y번째 칸에는 반드시 X가 들어갑니다.",

    "[PR]": "프리즘: 빨간 육각형 사이의 두 숫자를 두 자리 수로 읽으면 소수이고, 파란 육각형 사이의 두 숫자를 두 자리 수로 읽으면 제곱수입니다. 가로는 왼쪽이 십의 자리, 세로는 위가 십의 자리입니다.",
    "[TM]": "템퍼러쳐: 파란 영역 내 세 숫자의 합은 10 이하, 초록 영역은 합이 정확히 15, 빨간 영역의 합은 20 이상입니다.",
    "[RT]": "루트: 회색 숫자가 표시된 칸에서 가장 가까운 같은 숫자까지의 거리는 표시된 값과 같습니다.",
    "[PO]": "포인트: 삼각형 모양으로 연결된 두 칸에서, 삼각형이 가리키는 쪽이 아닌 쪽보다 숫자가 커야 합니다.",
    "[ST]": "스텐실: 스텐실 조각을 회전하거나 뒤집어서 보드 위에 놓을 때, 조각의 숫자들이 보드의 숫자와 완전히 일치하는 위치가 존재하면 안 됩니다.",

    "[VT]": "벡터: 삼각형이 표시된 칸의 숫자를 X이라 하면, 그 칸에서 삼각형이 가리키는 방향으로 X칸 이동한 위치에 9가 있습니다.",
    "[SR]": "스트림: 하늘색 선 위의 칸들은 홀수와 짝수가 번갈아가며 등장해야 합니다.",
    "[PA]": "페어: 점선 테두리로 표시된 2칸 영역들 중 어느 두 개도 포함된 두 숫자의 쌍이 같을 수 없습니다.",
    "[IV]": "인버전: 녹색 선의 시작점인 큰 원부터 순서대로 숫자를 읽었을 때, 어떤 숫자가 바로 다음 숫자보다 큰 경우가 정확히 1번 발생합니다.",
    "[TR]": "트레일: 청색 원이 그려진 칸에서 시작해 주황색 원이 그려진 칸에서 끝나는, 상하좌우로 이동하며, … → 1 → 2 → … → 8 → 9 → 1 → … 순서를 따르는 경로가 존재합니다.",

    "[ES]": "이스케이프: 모든 짝수가 적힌 상하좌우로 인접한 덩어리는 보드판 상단 또는 하단 모서리와 만나야 합니다.",
    "[TP]": "트리플렛: 대각선 방향으로 연속한 세 칸의 숫자는 증가하거나 감소하는 순서로 나열될 수 없습니다.",
    "[EP]": "엡실론: 1, 2, 3, 4가 적힌 모든 칸은 상하좌우로 인접해 정확히 3칸의 크기를 갖는 덩어리를 형성합니다.",
    "[PD]": "프로덕트: 보드 바깥에 주어진 갈색 숫자는 그 줄에서 가장자리부터 3칸의 숫자 곱과 같습니다." + side_description,
    "[BP]": "범퍼: 상하좌우로 인접한 모든 칸과 값이 3 이상 차이나는 칸을 '범퍼'라고 합니다. 각 행과 열에는 정확히 한 개의 '범퍼'가 존재합니다.",
}

const info_text = document.getElementById('info-text')!;

function setup_modal(puzzle_data: PuzzleData) {
    const title = document.createElement('h2');
    title.innerText = `ID: ${puzzle_data.id}`;
    info_text.appendChild(title);

    for (const rule of puzzle_data.rules) {
        const description = document.createElement('p');
        description.innerText = rule.id + ' ' + rule_description[rule.id];
        info_text.appendChild(description);
    }
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
        const state = load_state(puzzle_data.id)
        if (state !== null) {
            solving_state = state;
        } else {
            solving_state = generate_default_solving_state(puzzle_data);
            if (puzzle_data.id !== "#00000") open_info();
        }
    }

    const [cell_map, left, right, top, bottom] = setup_grid(puzzle_data);
    init_all(cell_map, left, right, top, bottom, solving_state, puzzle_data.rules, puzzle_data.id);
    render_all(puzzle_data.rules);
    setup_listeners(solving_state);
    setup_modal(puzzle_data);
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
}

await main();
