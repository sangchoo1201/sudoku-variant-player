import {type BoardCoord, type Position, position_generator, type Rule, type SolvingState} from "./schema.ts";
import {check_all} from "./rule.ts";
import {
    add_selection, apply_value, clear_value, cycle_default_input_mode,
    get_input_alphabet, get_last_cell, get_single_selection_or_null,
    InputMode, type InputMode as InputModeType, is_selected,
    remove_selection, reset_selection, selection_to_text,
    set_input_alphabet, set_input_mode, set_last_cell, show_errors, set_default_input_mode,
    show_current_input_mode,
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
let active_pointer_id: number | null = null;
const modifiers = {
    shift: false,
    control: false,
    alt: false,
};

function config_input_mode() {
    set_input_mode(null);
    if (modifiers.shift) set_input_mode(InputMode.Corner);
    if (modifiers.control) set_input_mode(InputMode.Center);
    if (modifiers.shift && modifiers.control) set_input_mode(InputMode.Color);
    show_current_input_mode();
}

export function setup_listeners(
    solving_state: SolvingState, rules: Rule[]
) {
    for (const [input_mode, button_id] of [
        [InputMode.Normal, 'button-normal'],
        [InputMode.Corner, 'button-corner'],
        [InputMode.Center, 'button-center'],
        [InputMode.Color, 'button-color'],
    ] as [InputModeType, string][]) {
        const button = document.querySelector<HTMLButtonElement>(`#${button_id}`)!;
        button.addEventListener('pointerdown', () => {
            set_default_input_mode(input_mode);
        });
    }

    for (let i = 0; i <= 9; i++) {
        const button = document.querySelector<HTMLButtonElement>(`#button-${i}`)!;
        button.addEventListener('pointerdown', () => {
            apply_value(i.toString());
            const [_, errors] = check_all(solving_state, rules);
            show_errors(errors);
        });
    }

    const button_delete = document.querySelector<HTMLButtonElement>('#button-delete')!;
    button_delete.addEventListener('pointerdown', () => {
        clear_value();
        const [_, errors] = check_all(solving_state, rules);
        show_errors(errors);
    });

    const button_load_file = document.querySelector<HTMLButtonElement>('#button-load-file')!;
    const file_input = document.querySelector<HTMLInputElement>('#file-input')!;
    button_load_file.addEventListener('click', () => {
        file_input.click();
    });

    file_input.onchange = async () => {
        const file = file_input.files?.[0];
        if (!file) return;

        const text = await file.text();
        location.href = `?code=${text}`;
    };

    const button_load_text = document.querySelector<HTMLButtonElement>('#button-load-text')!;
    button_load_text.addEventListener('click', () => {
        const text = prompt("Enter base64 code");
        if (!text) return;

        location.href = `?code=${text}`;
    });

    const button_copy_board = document.querySelector<HTMLButtonElement>('#button-copy-board')!;
    button_copy_board.addEventListener('click', async () => {
        const text = selection_to_text(true);
        if (text.includes("0")) {
            const proceed = confirm("Empty cell detected. Do you want to copy anyway?");
            if (!proceed) return;
        }
        await navigator.clipboard.writeText(text);
        alert("Board data copied!");
    });

    window.addEventListener('keydown', (e) => {
        if (e.repeat) return; // 꾹 누름 방지

        const code = e.code;

        if (code === 'ShiftLeft' || code === 'ShiftRight') modifiers.shift = true;
        if (code === 'ControlLeft' || code === 'ControlRight' || code === 'MetaLeft' || code === 'MetaRight') modifiers.control = true;
        if (code === 'AltLeft' || code === 'AltRight') modifiers.alt = true;

        config_input_mode();
        set_input_alphabet(null);
        if (modifiers.alt) set_input_alphabet(true);

        const input_alphabet = get_input_alphabet();
        const last_cell = get_last_cell();

        // shortcuts
        if (modifiers.control && !input_alphabet) {
            if (code === 'KeyA') {
                e.preventDefault();
                for (const [r, c] of position_generator()) {
                    add_selection([r, c], false);
                }
                return;
            }
        }

        if (code === 'Space') {
            e.preventDefault();
            cycle_default_input_mode(!modifiers.shift);
        }
        if (code === 'Tab') {
            e.preventDefault();
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
            add_selection([nr, nc] as Position);
            return;
        }

        // 숫자 입력
        for (const keyword of ['Digit', 'Numpad', 'Key']) {
            if (keyword === 'Key' && !input_alphabet) continue;
            if (code.startsWith(keyword)) {
                e.preventDefault();
                const key = code.slice(keyword.length);
                if (keyword === 'Numpad' && !('0' <= key && key <= '9')) continue;
                apply_value(key);
            }
        }

        // 삭제
        if (code === 'Backspace' || code === 'Delete') {
            clear_value();
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
            config_input_mode();
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

    window.addEventListener('pointerdown', (e) => {
        if (active_pointer_id !== null) return;
        active_pointer_id = e.pointerId;

        const controls = (e.target as HTMLElement).closest('#controls');
        if (controls) return;

        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) {
            reset_selection();
            return;
        }

        const r = Number(target.dataset.row) as BoardCoord;
        const c = Number(target.dataset.col) as BoardCoord;
        const multi_select = e.ctrlKey || e.metaKey || e.shiftKey;

        drag_mode = DragMode.Add;
        if (multi_select) {
            if (is_selected([r, c])) {
                remove_selection([r, c]);
                drag_mode = DragMode.Remove;
            } else {
                add_selection([r, c]);
            }
            return;
        }

        const [sr, sc] = get_single_selection_or_null() ?? [-1, -1];
        reset_selection();
        if (!(r === sr && c === sc)) {
            add_selection([r, c]);
        }
    });

    window.addEventListener('dblclick', (e) => {
        const target = (e.target as HTMLElement).closest('.cell') as HTMLDivElement;
        if (!target) return;

        const r = Number(target.dataset.row) as BoardCoord;
        const c = Number(target.dataset.col) as BoardCoord;

        const value = solving_state.board[r][c].number;

        if (value === null) return; // 빈칸은 무시

        reset_selection();

        for (const [i, j] of position_generator()) {
            if (solving_state.board[i][j].number === value) {
                add_selection([i, j], false);
            }
        }
        set_last_cell([r, c]);
    });

    window.addEventListener('pointermove', (e) => {
        if (e.pointerId !== active_pointer_id) return;
        if (drag_mode === DragMode.None) return;

        const target = document.elementFromPoint(e.clientX, e.clientY)
            ?.closest('.cell') as HTMLDivElement;

        if (!target) return;

        const r = Number(target.dataset.row) as BoardCoord;
        const c = Number(target.dataset.col) as BoardCoord;

        if (drag_mode === DragMode.Add) {
            add_selection([r, c]);
        } else {
            remove_selection([r, c]);
        }
    });

    window.addEventListener('pointerup', () => {
        active_pointer_id = null;
        drag_mode = DragMode.None;
    });

    window.addEventListener('pointercancel', () => {
        active_pointer_id = null;
        drag_mode = DragMode.None;
    });
}
