import type {Position, SolvingState} from "./schema.ts";

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
let selected = new Set<number>();
const encode = ([r, c]: Position) => r * 100 + c;

export function setup_selection(cell_map: HTMLDivElement[][], solving_state: SolvingState) {
    const grid = document.getElementById('main-grid')!;

    function add_selection(pos: Position, is_last: boolean = true) {
        if (selected.has(encode(pos))) return;
        selected.add(encode(pos));
        const [r, c] = pos;
        const cell = cell_map[r][c];
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
        const cell = cell_map[r][c];
        cell.classList.remove('selected');
        cell.classList.remove('selected-last');
    }

    function reset_selection() {
        selected.clear();
        for (let r = 0; r < 9; r++) {
            for (let c = 0; c < 9; c++) {
                const cell = cell_map[r][c];
                cell.classList.remove('selected');
                cell.classList.remove('selected-last');
            }
        }
        last_cell = null;
    }

    function is_common(value: number, mode: InputMode) {
        for (let k of selected) {
            const r = Math.floor(k / 100), c = k % 100;
            const cell = solving_state.board[r][c];
            if (cell.fixed) continue;
            switch (mode) {
                case InputMode.Normal:
                    if (cell.number !== value) return false;
                    break;
                case InputMode.Corner:
                    if (!cell.corner[value.toString()]) return false;
                    break;
                case InputMode.Center:
                    if (!cell.center[value.toString()]) return false;
                    break;
            }
        }
        return true;
    }

    function apply_number(value: number, mode: InputMode, add: boolean = true) {
        selected.forEach(k => {
            const r = Math.floor(k / 100), c = k % 100;
            const cell = solving_state.board[r][c];
            if (cell.fixed) return;
            if (mode == InputMode.Normal) {
                cell.number = add ? value : null;
                cell_map[r][c].textContent = add ? value.toString() : '';
            }
        });
    }

    window.addEventListener('keydown', (e) => {
        if (e.repeat) return; // 꾹 누름 방지

        let mode = input_mode;
        if (e.ctrlKey) mode = InputMode.Corner;
        if (e.shiftKey) mode = InputMode.Center;

        const key = e.key;

        // 숫자 입력
        if (key >= '1' && key <= '9') {
            apply_number(Number(key), mode, !is_common(Number(key), mode));
        }

        // 삭제
        if (key === 'Backspace' || key === 'Delete') {
            apply_number(0, mode, false);
        }
    });

    window.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) {
            reset_selection();
            return;
        }

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);
        const multi_select = e.ctrlKey || e.shiftKey;

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
        console.log(`dblclick at ${r}, ${c}`);

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
