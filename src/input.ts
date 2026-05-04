import type {Position, SolvingState} from "./schema.ts";

const DragMode = {
    None: "none",
    Add: "add",
    Remove: "remove",
} as const;
type DragMode = typeof DragMode[keyof typeof DragMode];

let last_cell: HTMLDivElement | null = null;
let drag_mode: DragMode = DragMode.None;
let selected = new Set<number>();
const encode = ([r, c]: Position) => r * 100 + c;

function add_selection(cell_map: HTMLDivElement[][], pos: Position, is_last: boolean = true) {
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

function remove_selection(cell_map: HTMLDivElement[][], pos: Position) {
    if (!selected.has(encode(pos))) return;
    selected.delete(encode(pos));
    const [r, c] = pos;
    const cell = cell_map[r][c];
    cell.classList.remove('selected');
    cell.classList.remove('selected-last');
}

function reset_selection(cell_map: HTMLDivElement[][]) {
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

export function setup_selection(cell_map: HTMLDivElement[][], solving_state: SolvingState) {
    const grid = document.getElementById('main-grid')!;

    window.addEventListener('mousedown', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) {
            reset_selection(cell_map);
            return;
        }

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);
        const multi_select = e.ctrlKey || e.shiftKey;

        drag_mode = DragMode.Add;
        if (multi_select && selected.has(encode([r, c]))) {
            remove_selection(cell_map, [r, c]);
            drag_mode = DragMode.Remove;
            return;
        }
        if (!multi_select) {
            reset_selection(cell_map);
        }
        add_selection(cell_map, [r, c]);
    });

    grid.addEventListener('dblclick', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) return;

        const r = Number(target.dataset.row);
        const c = Number(target.dataset.col);
        console.log(`dblclick at ${r}, ${c}`);

        const value = solving_state.board[r][c].number;

        if (value === null) return; // 빈칸은 무시

        reset_selection(cell_map);

        for (let i = 0; i < 9; i++) {
            for (let j = 0; j < 9; j++) {
                if (solving_state.board[i][j].number === value) {
                    add_selection(cell_map, [i, j], false);
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
            add_selection(cell_map, [r, c]);
        } else {
            remove_selection(cell_map, [r, c]);
        }
    });

    window.addEventListener('mouseup', () => {
        drag_mode = DragMode.None;
    });
}
