import {move_selection} from "./input.ts";
import {
    apply_value,
    clear_value, close_info, cycle_default_input_mode,
    get_input_mode,
    get_last_cell,
    InputMode, is_info_shown, open_info,
    redo,
    reset_selection,
    undo
} from "./cell.ts";
import type {Position} from "./schema.ts";

type ButtonMap = Record<number, boolean>;
type AxeMap = Record<"lx" | "ly" | "rx" | "ry", number>;

let buttons_before: ButtonMap = {};
let axes_before: AxeMap = {lx: 0, ly: 0, rx: 0, ry: 0};
let last_cell_gamepad: Position = [0, 0];

const axes_list = ['lx', 'ly', 'rx', 'ry'] as const;

const button_to_code = {
    12: 'ArrowUp',
    13: 'ArrowDown',
    14: 'ArrowLeft',
    15: 'ArrowRight',
} as const;

function move_selection_gamepad(code: string, multi_select: boolean) {
    move_selection(code, multi_select, last_cell_gamepad);
    const last_cell = get_last_cell();
    if (last_cell !== null) {
        const r = Number(last_cell.dataset.row);
        const c = Number(last_cell.dataset.col);
        last_cell_gamepad = [r, c] as Position;
    }
}

const digit_buttons: HTMLButtonElement[] = Array.from(
    { length: 10 },
    (_, i) => document.querySelector<HTMLButtonElement>(`#button-${i}`)!,
);

function select_button(button: HTMLButtonElement, select: boolean) {
    if (select) {
        button.classList.add("selected-button");
    } else {
        button.classList.remove("selected-button");
    }
}

export function update_gamepad() {
    const gamepads = navigator.getGamepads();

    for (const gamepad of gamepads) {
        if (!gamepad) continue;

        const buttons: ButtonMap = {};
        gamepad.buttons.forEach((button, index) => {
            buttons[index] = button.pressed;
        });

        const button_down: ButtonMap = {};
        for (const index in buttons) {
            const i = Number(index);
            button_down[i] = buttons_before[i] !== true && buttons[i];
        }

        const [lx, ly, rx, ry] = gamepad.axes.map(x => Math.trunc(x * 1.95));
        const axes: AxeMap = {lx, ly, rx, ry};

        const axe_down: AxeMap = {lx: 0, ly: 0, rx: 0, ry: 0};
        for (const axe of axes_list) {
            if (axes_before[axe] !== 1 && axes[axe] === 1) axe_down[axe] = 1;
            if (axes_before[axe] !== -1 && axes[axe] === -1) axe_down[axe] = -1;
        }

        if (is_info_shown()) {
            for (const index in button_down) {
                if (button_down[Number(index)]) {
                    close_info();
                    break;
                }
            }
        } else {
            // input logic
            if (button_down[8]) open_info();

            if (button_down[0]) reset_selection();
            if (button_down[2]) redo();
            if (button_down[3]) undo();

            const multi_select = buttons[1];

            for (const index of [12, 13, 14, 15] as const) {
                if (button_down[index]) {
                    move_selection_gamepad(button_to_code[index], multi_select);
                }
            }

            if (axe_down['lx'] === -1) move_selection_gamepad('ArrowLeft', multi_select);
            if (axe_down['lx'] === 1) move_selection_gamepad('ArrowRight', multi_select);
            if (axe_down['ly'] === -1) move_selection_gamepad('ArrowUp', multi_select);
            if (axe_down['ly'] === 1) move_selection_gamepad('ArrowDown', multi_select);

            let selected_digit = 0;
            const digit_zero = get_input_mode() !== InputMode.Normal && buttons[11];
            select_button(digit_buttons[0], digit_zero);
            for (const [index, [x, y]] of ([
                [-1, -1], [0, -1], [1, -1],
                [-1, 0], [0, 0], [1, 0],
                [-1, 1], [0, 1], [1, 1]
            ] as [number, number][]).entries()) {
                const condition = axes['rx'] === x && axes['ry'] === y && !digit_zero;
                select_button(digit_buttons[index + 1], condition);
                if (condition) selected_digit = index + 1;
            }

            if (button_down[4]) apply_value(String(selected_digit));
            if (button_down[5]) clear_value();
            if (button_down[6]) cycle_default_input_mode(false);
            if (button_down[7]) cycle_default_input_mode(true);
        }

        // for next frame
        buttons_before = buttons;
        axes_before = axes;
        break;
    }

    requestAnimationFrame(update_gamepad);
}