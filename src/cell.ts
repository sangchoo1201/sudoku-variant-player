import type {CellType} from "./main.ts";
import {
    type BoardChange,
    type Digit, type DigitOrZero,
    type Position,
    position_generator,
    type PositionExtended,
    type Rule, type SingleMemoDelete, type SingleNumberChange,
    type SolvingState
} from "./schema.ts";
import {check_all} from "./rule.ts";
import {save_state} from "./storage.ts";

export const InputMode = {
    Normal: "normal",
    Corner: "corner",
    Center: "center",
    Color: "color",
} as const;
export type InputMode = typeof InputMode[keyof typeof InputMode];

const next_mode: Record<InputMode, InputMode> = {
    [InputMode.Normal]: InputMode.Corner,
    [InputMode.Corner]: InputMode.Center,
    [InputMode.Center]: InputMode.Color,
    [InputMode.Color]: InputMode.Normal,
};

const prev_mode: Record<InputMode, InputMode> = {
    [InputMode.Normal]: InputMode.Color,
    [InputMode.Corner]: InputMode.Normal,
    [InputMode.Center]: InputMode.Corner,
    [InputMode.Color]: InputMode.Center,
};

type ModifyType =
    { type: "add", value: string } |
    { type: "remove", value: string } |
    { type: "reset" } |
    { type: "nothing" } |
    { type: "overwrite_number", value: Digit | null } |
    { type: "overwrite_memo", value: Record<string, true>};

const Modify = {
    add: (value: string): ModifyType => ({ type: 'add', value }),
    remove: (value: string): ModifyType => ({ type: 'remove', value }),
    reset: (): ModifyType => ({ type: 'reset' }),
    nothing: (): ModifyType => ({ type: 'nothing' }),
    overwrite_number: (value: Digit | null): ModifyType => ({ type: 'overwrite_number', value }),
    overwrite_memo: (value: Record<string, true>): ModifyType => ({ type: 'overwrite_memo', value }),
};

const color_map: string[] = [
    "rgba(0, 0, 0)",
    "rgb(166, 219, 87)",
    "rgb(221, 103, 234)",
    "rgb(219, 132, 26)",
    "rgb(239, 27, 23)",
    "rgb(249, 227, 29)",
    "rgb(28, 134, 239)",
    "rgb(191, 191, 191)",
    "rgb(127, 127, 127)",
    "rgb(63, 63, 63)",
];

function entries<T extends object>(obj: T) {
    return Object.entries(obj) as [keyof T, T[keyof T]][];
}

function polar_to_cartesian(cx: number, cy: number, r: number, angle: number) {
    const rad = angle * Math.PI / 180;
    return [cx + r * Math.cos(rad), cy - r * Math.sin(rad)];
}

function create_polygons(colors: number[]): SVGElement[] {
    const n = colors.length;

    if (n === 1) {
        const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
        );
        circle.setAttribute("cx", "0.5");
        circle.setAttribute("cy", "0.5");
        circle.setAttribute("r", "1");
        circle.setAttribute("fill", color_map[colors[0]]);
        return [circle];
    }

    const paths: SVGPathElement[] = [];
    for (const [i, color] of colors.entries()) {
        const path = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "path"
        );
        const [x1, y1] = polar_to_cartesian(0.5, 0.5, 1, 75 - 360 / n * i);
        const [x2, y2] = polar_to_cartesian(0.5, 0.5, 1, 75 - 360 / n * (i + 1));
        path.setAttribute('d', `
            M 0.5 0.5
            L ${x1} ${y1}
            A 1 1 0 0 1 ${x2} ${y2}
            Z
        `);
        path.setAttribute("fill", color_map[color]);
        paths.push(path);
    }
    return paths;
}

const digit_buttons: HTMLButtonElement[] = Array.from(
    { length: 10 },
    (_, i) => document.querySelector<HTMLButtonElement>(`#button-${i}`)!,
);

for (let i = 0; i <= 9; i++) {
    const div = document.createElement("div");
    div.classList.add("button-color");
    div.hidden = true;
    div.style.background = color_map[i];
    digit_buttons[i].appendChild(div);
}

const mode_buttons: Record<InputMode, HTMLButtonElement> = {
    [InputMode.Normal]: document.querySelector<HTMLButtonElement>("#button-normal")!,
    [InputMode.Corner]: document.querySelector<HTMLButtonElement>("#button-corner")!,
    [InputMode.Center]: document.querySelector<HTMLButtonElement>("#button-center")!,
    [InputMode.Color]: document.querySelector<HTMLButtonElement>("#button-color")!,
};

const modal = document.getElementById('info-modal')!;

let last_cell: HTMLDivElement | null = null;
let default_input_mode: InputMode = InputMode.Normal;
let input_mode: InputMode | null = null;
let selected = new Set<number>();
const encode = ([r, c]: Position) => r * 100 + c;
const decode = (k: number) => [Math.floor(k / 100), k % 100] as Position;

let cell_map: CellType[][];
let left: HTMLDivElement[];
let right: HTMLDivElement[];
let top: HTMLDivElement[];
let bottom: HTMLDivElement[];
let solving_state: SolvingState;
let rules: Rule[];
let puzzle_id: string;

export function init_all(
    map: CellType[][],
    l: HTMLDivElement[],
    r: HTMLDivElement[],
    t: HTMLDivElement[],
    b: HTMLDivElement[],
    state: SolvingState,
    rule: Rule[],
    id: string,
) {
    cell_map = map;
    left = l;
    right = r;
    top = t;
    bottom = b;
    solving_state = state;
    rules = rule;
    puzzle_id = id;

    show_errors();
}

export function open_info(): void {
    modal.classList.add('show-modal');
}

export function close_info(): boolean {
    const shown = modal.classList.contains('show-modal');
    modal.classList.remove('show-modal');
    return shown;
}

export function show_current_input_mode() {
    const mode = get_input_mode();
    for (const [m, button] of Object.entries(mode_buttons) as [InputMode, HTMLButtonElement][]) {
        if (m === mode) {
            button.classList.add("selected-mode");
        } else {
            button.classList.remove("selected-mode");
        }
    }
    const hidden = mode !== InputMode.Color;
    for (const digit_button of digit_buttons) {
        digit_button.querySelector<HTMLDivElement>(".button-color")!.hidden = hidden;
    }
}

export function set_default_input_mode(mode: InputMode) {
    default_input_mode = mode;
    show_current_input_mode();
}

export function cycle_default_input_mode(next: boolean) {
    default_input_mode = (next ? next_mode : prev_mode)[default_input_mode];
    show_current_input_mode();
}

export function set_input_mode(mode: InputMode | null) {
    input_mode = mode;
}

export function get_input_mode(): InputMode {
    return input_mode ?? default_input_mode;
}

export function is_selected(pos: Position): boolean {
    return selected.has(encode(pos));
}

export function get_single_selection_or_null(): Position | null {
    if (selected.size !== 1) return null;
    const [k] = selected.values();
    return decode(k);
}

export function get_selection_size(): number {
    return selected.size;
}

export function get_last_cell(): HTMLDivElement | null {
    return last_cell;
}

export function set_last_cell([r, c]: Position) {
    const cell = cell_map[r][c].cell;
    if (last_cell !== null) {
        last_cell.classList.remove('selected-last');
    }
    last_cell = cell;
    cell.classList.add('selected-last');
}

export function add_selection(pos: Position, is_last: boolean = true) {
    if (selected.has(encode(pos))) return;
    selected.add(encode(pos));
    const [r, c] = pos;
    const cell = cell_map[r][c].cell;
    cell.classList.add('selected');

    if (!is_last) return;

    set_last_cell(pos);
}

export function remove_selection(pos: Position) {
    if (!selected.has(encode(pos))) return;
    selected.delete(encode(pos));
    const [r, c] = pos;
    const cell = cell_map[r][c].cell;
    cell.classList.remove('selected');
    cell.classList.remove('selected-last');
}

export function reset_selection() {
    selected.clear();
    for (const [r, c] of position_generator()) {
        const cell = cell_map[r][c].cell;
        cell.classList.remove('selected');
        cell.classList.remove('selected-last');
    }
    last_cell = null;
}

export function double_click([r, c]: Position) {
    let value: string = "";

    const mode = get_input_mode();
    const cell = solving_state.board[r][c];

    if (mode === InputMode.Normal) {
        if (cell.number === null) return;
        value = cell.number.toString();
    } else {
        let set: Record<string, true>;
        if (mode === InputMode.Color) {
            set = cell.color;
        } else if (!cell.fixed && cell.number === null) {
            set = cell[mode];
        } else {
            return;
        }
        for (const s in set) {
            value += s;
        }
    }

    select_all_value(value);
    set_last_cell([r, c]);
}

export function select_all_value(value: string) {
    reset_selection();

    const mode = get_input_mode();
    if (mode === InputMode.Normal) {
        const number = Number(value);
        for (const [i, j] of position_generator()) {
            if (solving_state.board[i][j].number === number) {
                add_selection([i, j], false);
            }
        }
    } else {
        for (const [i, j] of position_generator()) {
            const cell = solving_state.board[i][j];
            let set: Record<string, true>;
            if (mode === InputMode.Color) {
                set = cell.color;
            } else if (!cell.fixed) {
                set = cell[mode];
            } else {
                continue;
            }
            let has_all = true;
            for (const digit of value) {
                if (set[digit] === undefined) {
                    has_all = false;
                    break;
                }
            }
            if (has_all) {
                add_selection([i, j], false);
            }
        }
    }
}

function is_common(value: string) {
    const mode = get_input_mode();
    for (let k of selected) {
        const [r, c] = decode(k);
        const cell = solving_state.board[r][c];
        if (mode === InputMode.Color && !cell.color[value]) {
            return false;
        }
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

function normal_modify([r, c]: Position, modify: ModifyType): SingleNumberChange | null {
    const cell_element = cell_map[r][c];
    const cell_state = solving_state.board[r][c];
    if (cell_state.fixed) return null;

    const before = cell_state.number;
    if (modify.type === "add") {
        cell_state.number = Number(modify.value) as Digit;
    } else if (modify.type === "remove" || modify.type === "reset") {
        cell_state.number = null;
    } else if (modify.type === "overwrite_number") {
        cell_state.number = modify.value;
    }
    const after = cell_state.number;

    cell_element.normal.textContent = cell_state.number?.toString() ?? '';
    if (cell_state.number) {
        cell_element.cell.classList.add('filled');
    } else {
        cell_element.cell.classList.remove('filled');
    }

    return before === after ? null : { pos: [r, c], number: before };
}

function equal_set(s1: Record<string, true>, s2: Record<string, true>): boolean {
    const k1 = Object.keys(s1);
    if (k1.length !== Object.keys(s2).length) return false;
    return k1.every(x => Object.hasOwn(s2, x));
}

function set_modify(set: Record<string, true>, modify: ModifyType): boolean {
    const before = { ...set };
    switch (modify.type) {
        case "add":
            set[modify.value] = true;
            break;

        case "remove":
            delete set[modify.value];
            break;

        case "reset":
            for (const key in set) {
                delete set[key];
            }
            break;

        case "overwrite_memo":
            for (const key in set) {
                delete set[key];
            }
            for (const key in modify.value) {
                set[key] = true;
            }
            break;
    }
    const after = { ...set };
    return !equal_set(before, after);
}

function corner_modify([r, c]: Position, modify: ModifyType): boolean {
    const cell_element = cell_map[r][c];
    const cell_state = solving_state.board[r][c];
    if (cell_state.fixed) return false;
    if (cell_state.number !== null && modify.type !== "nothing" && modify.type !== "overwrite_memo") return false;

    const change = set_modify(cell_state.corner, modify);
    if (!change && modify.type !== "nothing") return false;

    const sorted_keys = Object.keys(cell_state.corner).sort();
    for (let i = 0; i < 8; i++) {
        if (i < sorted_keys.length) {
            cell_element.corner[i].textContent = sorted_keys[i];
        } else {
            cell_element.corner[i].textContent = '';
        }
    }
    return true;
}

function center_modify([r, c]: Position, modify: ModifyType): boolean {
    const cell_element = cell_map[r][c];
    const cell_state = solving_state.board[r][c];
    if (cell_state.fixed) return false;
    if (cell_state.number !== null && modify.type !== "nothing" && modify.type !== "overwrite_memo") return false;

    const change = set_modify(cell_state.center, modify);
    if (!change && modify.type !== "nothing") return false;

    const sorted_keys = Object.keys(cell_state.center).sort();
    cell_element.center.textContent = sorted_keys.join('').slice(0, 8);
    return true;
}

function color_modify([r, c]: Position, modify: ModifyType): boolean {
    const cell_element = cell_map[r][c];
    const cell_state = solving_state.board[r][c];

    const change = set_modify(cell_state.color, modify);
    if (!change && modify.type !== "nothing") return false;

    const sorted_keys = Object.keys(cell_state.color).map(Number).sort();
    cell_element.color.replaceChildren();
    const polygons = create_polygons(sorted_keys);
    for (const polygon of polygons) {
        cell_element.color.appendChild(polygon);
    }
    return true;
}

const memo_modify = {
    [InputMode.Corner]: corner_modify,
    [InputMode.Center]: center_modify,
    [InputMode.Color]: color_modify,
} as const;

export function update_all() {
    for (const p of position_generator()) {
        for (const f of [normal_modify, corner_modify, center_modify, color_modify]) {
            f(p, Modify.nothing());
        }
    }
    show_errors();
}

function update_board(changes: BoardChange) {
    if (changes.type === InputMode.Normal) {
        if (changes.before.length === 0) return;
        show_errors();
    }
    solving_state.undo.push(changes);
    if (solving_state.undo.length > 100) {
        solving_state.undo.shift();
    }
    solving_state.redo = [];
    save_state(puzzle_id, solving_state);
}

export function apply_value(value: string) {
    const mode = get_input_mode();

    if (mode === InputMode.Normal && !('1' <= value && value <= '9')) return;

    const add = !is_common(value);
    if (mode === InputMode.Normal) {
        const before: SingleNumberChange[] = [];
        selected.forEach(k => {
            const result = normal_modify(decode(k), (add ? Modify.add : Modify.remove)(value));
            if (result !== null) before.push(result);
        });
        update_board({ type: "normal", before, after: (add ? Number(value) as Digit : null) });
    } else {
        const pos: Position[] = [];
        selected.forEach(k => {
            const result = memo_modify[mode](decode(k), (add ? Modify.add : Modify.remove)(value));
            if (result) pos.push(decode(k));
        });
        update_board({ type: mode, delete: false, pos, memo: Number(value) as DigitOrZero });
    }
}

export function clear_value() {
    const has_mode: Record<InputMode, boolean> = {
        [InputMode.Normal]: false,
        [InputMode.Center]: false,
        [InputMode.Corner]: false,
        [InputMode.Color]: false,
    };
    selected.forEach(k => {
        const [r, c] = decode(k);
        const cell = solving_state.board[r][c];
        if (Object.keys(cell.color).length !== 0) has_mode[InputMode.Color] = true;
        if (cell.fixed) return;
        if (cell.number !== null) has_mode[InputMode.Normal] = true;
        if (Object.keys(cell.center).length !== 0) has_mode[InputMode.Center] = true;
        if (Object.keys(cell.corner).length !== 0) has_mode[InputMode.Corner] = true;
    });

    const input_mode = get_input_mode();
    let mode: InputMode | null = null;
    for (const m of [InputMode.Normal, InputMode.Center, InputMode.Corner, InputMode.Color]) {
        if (has_mode[m]) {
            mode = m;
            break;
        }
    }
    if (has_mode[input_mode]) mode = input_mode;
    if (mode === null) return;

    if (mode === InputMode.Normal) {
        const before: SingleNumberChange[] = [];
        selected.forEach(k => {
            const result = normal_modify(decode(k), Modify.reset());
            if (result !== null) before.push(result);
        });
        update_board({ type: "normal", before, after: null });
    } else {
        const before: SingleMemoDelete[] = [];
        selected.forEach(k => {
            const [r, c] = decode(k);
            const cell = solving_state.board[r][c];
            let set = {};
            if (cell.fixed) {
                if (mode === "color") set = { ...cell[mode] };
                else return;
            } else {
                set = { ...cell[mode] };
            }
            const result = memo_modify[mode]([r, c], Modify.reset());
            if (result) before.push({ pos: [r, c], memo: set });
        });
        update_board({ type: mode, delete: true, before: before } as BoardChange);
    }
}

export function append_errors(error_positions: PositionExtended[]) {
    for (const [a, b] of error_positions) {
        if (a === 'left') {
            left[b].classList.add('error');
            continue;
        }
        if (a === 'right') {
            right[b].classList.add('error');
            continue;
        }
        if (a === 'top') {
            top[b].classList.add('error');
            continue;
        }
        if (a === 'bottom') {
            bottom[b].classList.add('error');
            continue;
        }
        const cell = cell_map[a][b].cell;
        cell.classList.add('error');
    }
}

export function show_errors() {
    const [_, errors] = check_all(solving_state, rules);

    for (let i = 0; i < 9; i++) {
        for (let j = 0; j < 9; j++) {
            const cell = cell_map[i][j].cell;
            cell.classList.remove('error');
        }
        left[i].classList.remove('error');
        right[i].classList.remove('error');
        top[i].classList.remove('error');
        bottom[i].classList.remove('error');
    }

    for (const [_, error] of entries(errors)) {
        if (error === undefined) continue;
        append_errors(error);
    }
}

export function selection_to_text(select_all: boolean = false): string {
    let texts: string[][] = [[], [], [], [], [], [], [], [], []];
    let mn_row = 8, mx_row = 0, mn_col = 8, mx_col = 0;
    for (const [r, c] of position_generator()) {
        if (!(selected.has(encode([r, c])) || select_all)) {
            texts[r].push(" ");
            continue;
        }
        mn_row = Math.min(mn_row, r);
        mx_row = Math.max(mx_row, r);
        mn_col = Math.min(mn_col, c);
        mx_col = Math.max(mx_col, c);
        texts[r].push((solving_state.board[r][c].number ?? 0).toString());
    }
    return texts.slice(mn_row, mx_row + 1).map(s => s.slice(mn_col, mx_col + 1).join("")).join("\n");
}

export function undo() {
    const action = solving_state.undo.pop();
    if (action === undefined) return;
    solving_state.redo.push(action);

    if (action.type === "normal") {
        for (const { pos, number } of action.before) {
            normal_modify(pos, Modify.overwrite_number(number));
        }
        show_errors();
    } else if (action.delete) {
        const modify_function = memo_modify[action.type];
        for (const { pos, memo } of action.before) {
            modify_function(pos, Modify.overwrite_memo(memo));
        }
    } else {
        const modify_function = memo_modify[action.type];
        const [r, c] = action.pos[0];
        const cell = solving_state.board[r][c];
        const add = (!cell.fixed && cell[action.type][action.memo] !== true);
        for (const pos of action.pos) {
            modify_function(pos, (add ? Modify.add : Modify.remove)(action.memo.toString()));
        }
    }
    save_state(puzzle_id, solving_state);
}

export function redo() {
    const action = solving_state.redo.pop();
    if (action === undefined) return;
    solving_state.undo.push(action);

    if (action.type === "normal") {
        for (const { pos } of action.before) {
            normal_modify(pos, Modify.overwrite_number(action.after));
        }
        show_errors();
    } else if (action.delete) {
        const modify_function = memo_modify[action.type];
        for (const { pos } of action.before) {
            modify_function(pos, Modify.reset());
        }
    } else {
        const modify_function = memo_modify[action.type];
        const [r, c] = action.pos[0];
        const cell = solving_state.board[r][c];
        const add = (!cell.fixed && cell[action.type][action.memo] !== true);
        for (const pos of action.pos) {
            modify_function(pos, (add ? Modify.add : Modify.remove)(action.memo.toString()));
        }
    }
    save_state(puzzle_id, solving_state);
}
