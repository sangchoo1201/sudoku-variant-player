import Logic from "logic-solver";
import {
    type BoardState,
    type Digit,
    digits,
    type Position,
    is_pos,
    position_generator
} from "./schema.ts";

const adjacent = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;

function is_equal([r1, c1]: Position, [r2, c2]: Position): boolean {
    return r1 === r2 && c1 === c2;
}

function get_neighbors([r, c]: Position): Position[] {
    return adjacent.map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(is_pos);
}

const CELL = ([r, c]: Position, v: Digit) => `C_${r}_${c}_${v}`;
const EDGE = ([r1, c1]: Position, [r2, c2]: Position) => `E_${r1}_${c1}_${r2}_${c2}`;

const conditions: any[] = [];

export function trail_sat_init(start: Position, end: Position, prime: boolean) {
    // All cells have exactly one value
    for (const pos of position_generator()) {
        conditions.push(Logic.exactlyOne(digits.map(v => CELL(pos, v))));
    }

    // For every edge pos1 -> pos2, v2 should be (v1 % 9 + 1)
    for (const pos1 of position_generator()) {
        for (const pos2 of get_neighbors(pos1)) {
            for (const v of digits) {
                conditions.push(Logic.implies(Logic.and(EDGE(pos1, pos2), CELL(pos1, v)), CELL(pos2, v % 9 + 1 as Digit)));
            }
        }
    }

    if (prime) {
        // Start/End must have exactly TWO outgoing/ingoing edge
        conditions.push(Logic.equalBits(
            Logic.sum(get_neighbors(start).map(next => EDGE(start, next))),
            Logic.constantBits(2),
        ));
        conditions.push(Logic.equalBits(
            Logic.sum(get_neighbors(end).map(prev => EDGE(prev, end))),
            Logic.constantBits(2),
        ));
    } else {
        // Start/End must have exactly one outgoing/ingoing edge
        conditions.push(Logic.exactlyOne(get_neighbors(start).map(next => EDGE(start, next))));
        conditions.push(Logic.exactlyOne(get_neighbors(end).map(prev => EDGE(prev, end))));
    }

    // Start/End must not have ingoing/outgoing edge
    conditions.push(Logic.and(...get_neighbors(start).map(prev => Logic.not(EDGE(prev, start)))));
    conditions.push(Logic.and(...get_neighbors(end).map(next => Logic.not(EDGE(start, next)))));

    // Every other cells can have at most one in/out edge
    // If so, it should be a pair
    for (const pos of position_generator()) {
        const out_edges = get_neighbors(pos).map(next => EDGE(pos, next));
        const in_edges = get_neighbors(pos).map(prev => EDGE(prev, pos));
        if (is_equal(pos, start) || is_equal(pos, end)) continue;

        for (const in_edge of in_edges) {
            conditions.push(Logic.implies(in_edge, Logic.exactlyOne(out_edges)));
        }
        for (const out_edge of out_edges) {
            conditions.push(Logic.implies(out_edge, Logic.exactlyOne(in_edges)));
        }
    }
}

export function trail_sat_solve(board: BoardState): boolean {
    const solver = new Logic.Solver();

    // Fix positions' value
    for (const [r, c] of position_generator()) {
        const v = board[r][c].number;
        if (v === null) continue;
        solver.require(CELL([r, c], v));
    }

    for (const cond of conditions) {
        solver.require(cond);
    }

    const solution = solver.solve();
    if (solution !== null) {
        const sol_board = Array.from({length: 17}, _ => Array.from({length: 17}, _ => " "));
        for (const s of solution.getTrueVars()) {
            if (typeof s !== "string") continue;
            if (s.startsWith("C")) {
                const [_, r, c, v] = s.split("_").map(Number);
                sol_board[r * 2][c * 2] = v.toString();
            }
            if (s.startsWith("E")) {
                const [_, r1, c1, r2, c2] = s.split("_").map(Number);
                sol_board[r1 + r2][c1 + c2] = "*";
            }
        }
        console.log(sol_board.map(row => row.join("")).join("\n"));
    }
    return solution !== null;
}