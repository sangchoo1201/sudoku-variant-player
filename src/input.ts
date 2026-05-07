import type {Position, Rule, SolvingState, RuleID} from "./schema.ts";
import {check_all} from "./rule.ts";
import type {CellType} from "./main.ts";

const direction_map: Partial<Record<string, [number, number]>> = {
    "ArrowUp": [-1, 0],
    "ArrowLeft": [0, -1],
    "ArrowDown": [1, 0],
    "ArrowRight": [0, 1],
} as const;

const DragMode = {
    None: "none",
    Add: "add",
    Remove: "remove",
} as const;
type DragMode = typeof DragMode[keyof typeof DragMode];

const InputMode = {
    Normal: "normal",
    Corner: "corner",
    Center: "center",
} as const;
type InputMode = typeof InputMode[keyof typeof InputMode];

let last_cell: HTMLDivElement | null = null;
let drag_mode: DragMode = DragMode.None;
let input_mode: InputMode = InputMode.Normal;
let input_alphabet = false;
let selected = new Set<number>();
const encode = ([r, c]: Position) => r * 100 + c;

function entries<T extends object>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

export function setup_selection(cell_map: CellType[][], solving_state: SolvingState, rules: Rule[]) {
    const grid = document.getElementById('main-grid')!;

    function add_selection(pos: Position, is_last: boolean = true) {
        if (selected.has(encode(pos))) return;
        selected.add(encode(pos));
        const [r, c] = pos;
        const cell = cell_map[r][c].cell;
        cell.classList.add('selected');

        if (!is_last) return;

        if (last_cell !== null) {
            last_cell.classList.remove('selected-last');
        }
        last_cell = cell;
        cell.classList.add('selected-last');
    }

    function remove_selection(pos: Position) {
        if (!selected.has(encode(pos))) return;
        selected.delete(encode(pos));
        const [r, c] = pos;
        const cell = cell_map[r][c].cell;
        cell.classList.remove('selected');
        cell.classList.remove('selected-last');
    }

    function reset_selection() {
        selected.clear();
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = cell_map[r][c].cell;
                cell.classList.remove('selected');
                cell.classList.remove('selected-last');
            }
        }
        last_cell = null;
    }

    function is_common(value: string, mode: InputMode) {
        for (let k of selected) {
            const r = Math.floor(k / 100), c = k % 100;
            const cell = solving_state.board[r][c];
            if (cell.fixed) continue;
            switch (mode) {
                case InputMode.Normal:
                    if (cell.number !== Number(value)) return false;
                    break;
                case InputMode.Corner:
                    if (!cell.corner[value] && cell.number === null) return false;
                    break;
                case InputMode.Center:
                    if (!cell.center[value] && cell.number === null) return false;
                    break;
            }
        }
        return true;
    }

    function update_corner(corner: HTMLDivElement[], set: Record<string, true>) {
        const sorted_keys = Object.keys(set).sort();
        for (let i = 0; i < 8; i++) {
            if (i < sorted_keys.length) {
                corner[i].textContent = sorted_keys[i];
            } else {
                corner[i].textContent = '';
            }
        }
    }

    function update_center(center: HTMLDivElement, set: Record<string, true>) {
        const sorted_keys = Object.keys(set).sort();
        center.textContent = sorted_keys.join('');
    }

    function apply_number(value: string, mode: InputMode, add: boolean = true) {
        selected.forEach(k => {
            const r = Math.floor(k / 100), c = k % 100;
            const cell = solving_state.board[r][c];
            if (cell.fixed) return;
            if (mode === InputMode.Normal) {
                if (add) {
                    cell.number = Number(value);
                    cell_map[r][c].normal.textContent = value;
                    cell_map[r][c].cell.classList.add('filled');
                } else {
                    cell.number = null;
                    cell_map[r][c].normal.textContent = '';
                    cell_map[r][c].cell.classList.remove('filled');
                }
            }
            if (cell.number !== null) return;
            if (mode === InputMode.Corner) {
                if (add) {
                    cell.corner[value] = true;
                } else {
                    delete cell.corner[value];
                }
                update_corner(cell_map[r][c].corner, cell.corner);
            }
            if (mode === InputMode.Center) {
                if (add) {
                    cell.center[value] = true;
                } else {
                    delete cell.center[value];
                }
                update_center(cell_map[r][c].center, cell.center);
            }
        });
    }

    function clear_number() {
        selected.forEach(k => {
            const r = Math.floor(k / 100), c = k % 100;
            const cell = solving_state.board[r][c];
            if (cell.fixed) return;
            if (cell.number !== null) {
                cell.number = null;
                cell_map[r][c].normal.textContent = '';
                cell_map[r][c].cell.classList.remove('filled');
                return;
            }
            cell.corner = {};
            update_corner(cell_map[r][c].corner, cell.corner);
            cell.center = {};
            update_center(cell_map[r][c].center, cell.center);
        })
    }

    function show_errors(errors: Partial<Record<RuleID, Position[]>>) {
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = cell_map[r][c].cell;
                cell.classList.remove('error');
            }
        }

        for (const [_, error] of entries(errors)) {
            if (error === undefined) continue;
            for (const [r, c] of error) {
                const cell = cell_map[r][c].cell;
                cell.classList.add('error');
            }
        }
    }

    window.addEventListener('keydown', (e) => {
        const control = e.ctrlKey || e.metaKey;

        if (e.repeat) return; // 꾹 누름 방지

        let mode = input_mode;
        if (e.shiftKey) mode = InputMode.Corner;
        if (control) mode = InputMode.Center;

        const code = e.code;

        // shortcuts
        if (control && !input_alphabet) {
            if (code === 'KeyA') {
                e.preventDefault();
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        add_selection([r, c], false);
                    }
                }
            }
        }

        // 방향키 이동
        if (code.startsWith('Arrow')) {
            const direction = direction_map[code];
            if (direction === undefined || last_cell === null) return;

            const r = Number(last_cell.dataset.row);
            const c = Number(last_cell.dataset.col);
            const [dr, dc] = direction;
            const nr = (r + dr + 9) % 9, nc = (c + dc + 9) % 9;

            if (!(e.ctrlKey || e.metaKey || e.shiftKey)) {
                reset_selection();
            }
            add_selection([nr, nc]);
        }

        // 숫자 입력
        for (const keyword of ['Digit', 'Numpad', 'Key']) {
            if (keyword === 'Key' && (mode === InputMode.Normal || !input_alphabet)) continue;
            if (code.startsWith(keyword)) {
                e.preventDefault();
                const key = code.slice(keyword.length);
                if (keyword === 'Numpad' && !('0' <= key && key <= '9')) continue;
                if (mode === InputMode.Normal && key == '0') continue;
                apply_number(key, mode, !is_common(key, mode));
            }
        }

        // 삭제
        if (code === 'Backspace' || code === 'Delete') {
            clear_number()
        }

        const [_, errors] = check_all(solving_state, rules);
        show_errors(errors);
    });

    window.addEventListener("copy", (e) => {
        e.preventDefault();

        let texts: string[][] = [];
        let mn_row = 8, mx_row = 0, mn_col = 8, mx_col = 0;
        for (let r = 0; r < 9; r++) {
            texts.push([]);
            for (let c = 0; c < 9; c++) {
                if (!selected.has(encode([r, c]))) {
                    texts[r].push(" ");
                    continue;
                }
                mn_row = Math.min(mn_row, r);
                mx_row = Math.max(mx_row, r);
                mn_col = Math.min(mn_col, c);
                mx_col = Math.max(mx_col, c);
                texts[r].push((solving_state.board[r][c].number ?? 0).toString());
            }
        }
        const text = texts.slice(mn_row, mx_row + 1).map(s => s.slice(mn_col, mx_col + 1)
            .join("")).join("\n");

        e.clipboardData?.setData("text/plain", text);
    });

    window.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) {
            reset_selection();
            return;
        }

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);
        const multi_select = e.ctrlKey || e.metaKey || e.shiftKey;

        drag_mode = DragMode.Add;
        if (multi_select && selected.has(encode([r, c]))) {
            remove_selection([r, c]);
            drag_mode = DragMode.Remove;
            return;
        }
        if (!multi_select) {
            reset_selection();
        }
        add_selection([r, c]);
    });

    grid.addEventListener('dblclick', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) return;

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);

        const value = solving_state.board[r][c].number;

        if (value === null) return; // 빈칸은 무시

        reset_selection();

        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (solving_state.board[i][j].number === value) {
                    add_selection([i, j], false);
                }
            }
        }
        target.classList.add('selected-last');
        last_cell = target;
    });

    window.addEventListener('mousemove', (e) => {
        if (drag_mode === DragMode.None) return;

        const target = document.elementFromPoint(e.clientX, e.clientY)
            ?.closest('.cell') as HTMLDivElement;

        if (!target) return;

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);

        if (drag_mode === DragMode.Add) {
            add_selection([r, c]);
        } else {
            remove_selection([r, c]);
        }
    });

    window.addEventListener('mouseup', () => {
        drag_mode = DragMode.None;
    });
}
