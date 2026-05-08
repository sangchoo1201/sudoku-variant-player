import type {Rule, SolvingState} from "./schema.ts";
import {check_all} from "./rule.ts";
import {
    add_selection, apply_number, clear_number,
    get_input_alphabet, get_input_mode, get_last_cell,
    InputMode, is_selected, remove_selection, reset_selection, selection_to_text,
    set_input_alphabet, set_input_mode, set_last_cell, show_errors, cycle_default_input_mode
} from "./cell.ts";

const DragMode = {
    None: "none",
    Add: "add",
    Remove: "remove",
} as const;
type DragMode = typeof DragMode[keyof typeof DragMode];

const direction_map: Partial<Record<string, [number, number]>> = {
    "ArrowUp": [-1, 0],
    "ArrowLeft": [0, -1],
    "ArrowDown": [1, 0],
    "ArrowRight": [0, 1],
} as const;

let drag_mode: DragMode = DragMode.None;
const modifiers = {
    shift: false,
    control: false,
    alt: false,
};

export function setup_listeners(
    solving_state: SolvingState, rules: Rule[]
) {
    const grid = document.getElementById('main-grid')!;

    window.addEventListener('keydown', (e) => {
        if (e.repeat) return; // 꾹 누름 방지

        const code = e.code;

        if (code === 'ShiftLeft' || code === 'ShiftRight') modifiers.shift = true;
        if (code === 'ControlLeft' || code === 'ControlRight' || code === 'MetaLeft' || code === 'MetaRight') modifiers.control = true;
        if (code === 'AltLeft' || code === 'AltRight') modifiers.alt = true;

        set_input_mode(null);
        if (modifiers.shift) set_input_mode(InputMode.Corner);
        if (modifiers.control) set_input_mode(InputMode.Center);
        if (modifiers.shift && modifiers.control) set_input_mode(InputMode.Color);
        set_input_alphabet(null)
        if (modifiers.alt) set_input_alphabet(true);

        const input_mode = get_input_mode();
        const input_alphabet = get_input_alphabet();
        const last_cell = get_last_cell();

        // shortcuts
        if (modifiers.control && !input_alphabet) {
            if (code === 'KeyA') {
                e.preventDefault();
                for (let r = 0; r < 9; r++) {
                    for (let c = 0; c < 9; c++) {
                        add_selection([r, c], false);
                    }
                }
                return;
            }
        }

        if (code === 'Space') {
            cycle_default_input_mode(!modifiers.shift);
        }

        // 방향키 이동
        if (code.startsWith('Arrow')) {
            const direction = direction_map[code];
            if (direction === undefined || last_cell === null) return;

            const r = Number(last_cell.dataset.row);
            const c = Number(last_cell.dataset.col);
            const [dr, dc] = direction;
            const nr = (r + dr + 9) % 9, nc = (c + dc + 9) % 9;

            if (!(modifiers.shift || modifiers.control)) {
                reset_selection();
            }
            add_selection([nr, nc]);
            return;
        }

        // 숫자 입력
        for (const keyword of ['Digit', 'Numpad', 'Key']) {
            if (keyword === 'Key' && (input_mode === InputMode.Normal || input_mode === InputMode.Color || !input_alphabet)) continue;
            if (code.startsWith(keyword)) {
                e.preventDefault();
                const key = code.slice(keyword.length);
                if (keyword === 'Numpad' && !('0' <= key && key <= '9')) continue;
                if (input_mode === InputMode.Normal && key === '0') continue;
                apply_number(key);
            }
        }

        // 삭제
        if (code === 'Backspace' || code === 'Delete') {
            clear_number();
        }

        const [_, errors] = check_all(solving_state, rules);
        show_errors(errors);
    });

    window.addEventListener("keyup", (e) => {
        const code = e.code;
        setTimeout(() => {
            if (code === 'ShiftLeft' || code === 'ShiftRight') modifiers.shift = false;
            if (code === 'ControlLeft' || code === 'ControlRight' || code === 'MetaLeft' || code === 'MetaRight') modifiers.control = false;
            if (code === 'AltLeft' || code === 'AltRight') modifiers.alt = false;
        }, 30);
    });

    window.addEventListener("blur", (_) => {
        modifiers.shift = false;
        modifiers.control = false;
        modifiers.alt = false;
    })

    window.addEventListener("copy", (e) => {
        e.preventDefault();

        const text = selection_to_text();
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
        if (multi_select && is_selected([r, c])) {
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
        set_last_cell([r, c]);
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
