import {
    type Position,
    type Rule,
    type SolvingState,
    type SegmentRule,
    type LinkRule,
    type LotusRule,
    type MetroRule,
    type SequenceRule,
    type QuantumRule,
    type RangeRule,
    type ReferenceRule,
    type PrismRule,
    type TemperatureRule,
    type RootRule,
    type PointRule,
    type StencilRule,
    type RuleID,
    type VectorRule,
    type StreamRule,
    type PairRule,
    type InversionRule,
    type BoardCoord,
    type Direction,
    type Digit,
    board_coords, digits, position_generator, type PositionExtended, type Side, type TrailRule, type ProductRule,
    type DirectionExtended, type BridgeRule, type ReflexRule, type AquariumRule,
} from "./schema.ts";
import {trail_sat_solve} from "./sat.ts";

type RuleCheckingResult = [true, []] | [false, PositionExtended[]];
type PureCheckingFunction = (solving_state: SolvingState) => RuleCheckingResult;
type RuleCheckingFunction<T extends Rule> = (solving_state: SolvingState, rule: T) => RuleCheckingResult;
type CoordinateMappingFunction = (i: number, j: number) => Position;

const adjacent = [[0, -1], [0, 1], [-1, 0], [1, 0]] as const;
const king_adjacent = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]] as const;

function is_coord(n: number): n is BoardCoord {
    return Number.isInteger(n) && 0 <= n && n < 9;
}

function is_pos(p: [number, number]): p is Position {
    const [r, c] = p;
    return is_coord(r) && is_coord(c);
}

function digit_to_coord(digit: Digit): BoardCoord {
    return digit - 1 as BoardCoord;
}

function is_digit(n: number): n is Digit {
    return Number.isInteger(n) && 1 <= n && n <= 9;
}

function create_error_collector() {
    const errors: PositionExtended[] = [];
    const unique = new Set<string>();
    const encode = ([r, c]: Position) => `${r},${c}`;

    return {
        add(pos: Position) {
            const key = encode(pos);
            if (unique.has(key)) return;

            unique.add(key);
            errors.push(pos);
        },

        add_all(positions: Position[]) {
            for (const pos of positions) {
                this.add(pos);
            }
        },

        add_side(side: Side, index: BoardCoord) {
            const key = `${side},${index}`;
            if (unique.has(key)) return;

            unique.add(key);
            errors.push([side, index]);
        },

        add_direction(direction: DirectionExtended, index: BoardCoord) {
            switch (direction) {
                case "ROW_LEFT":
                    this.add_side("left", index);
                    break;
                case "ROW":
                    this.add_side("right", index);
                    break;
                case "COL_TOP":
                    this.add_side("top", index);
                    break;
                case "COL":
                    this.add_side("bottom", index);
                    break;
            }
        },

        result(): RuleCheckingResult {
            return errors.length ? [false, errors] : [true, []];
        }
    }
}

function generate_get_pos(direction: Direction, index: BoardCoord): (x: BoardCoord) => Position {
    switch (direction) {
        case "ROW":
            return (x: BoardCoord) => [index, x];
        case "COL":
            return (x: BoardCoord) => [x, index];
    }
}

function generate_get_pos_extended(direction: DirectionExtended, index: BoardCoord): (x: BoardCoord) => Position {
    switch (direction) {
        case "ROW_LEFT":
            return (x: BoardCoord) => [index, x];
        case "ROW":
            return (x: BoardCoord) => [index, (8 - x) as BoardCoord];
        case "COL_TOP":
            return (x: BoardCoord) => [x, index];
        case "COL":
            return (x: BoardCoord) => [(8 - x) as BoardCoord, index];
    }
}

function generic_duplicate_check(
    solving_state: SolvingState, map: CoordinateMappingFunction
): RuleCheckingResult {
    const errors = create_error_collector();

    for (let i = 0; i < 9; i++) {
        let numbers = digits.reduce(
            (acc, d) => {
                acc[d] = [];
                return acc;
            },
            {} as Record<Digit, number[]>
        );
        for (let j = 0; j < 9; j++) {
            const [r, c] = map(i, j);
            const cell_data = solving_state.board[r][c];
            if (cell_data.number === null) continue;
            numbers[cell_data.number].push(j);
        }
        for (const n of digits) {
            if (numbers[n].length >= 2) {
                numbers[n].forEach(j => errors.add(map(i, j)));
            }
        }
    }
    return errors.result();
}

function generic_pair_check(
    solving_state: SolvingState, neighbors: readonly (readonly [number, number])[]
): RuleCheckingResult {
    const get_neighbors = (r: number, c: number) => {
        return neighbors
            .map(([dr, dc]) => [r + dr, c + dc] as const)
            .filter(([r, c]) => r >= 0 && r < 9 && c >= 0 && c < 9);
    }

    const errors = create_error_collector();

    for (const [r, c] of position_generator()) {
        const cell_data = solving_state.board[r][c];
        if (cell_data.number === null) continue;

        for (const [nr, nc] of get_neighbors(r, c)) {
            if (cell_data.number === solving_state.board[nr][nc].number) {
                errors.add([r, c]);
            }
        }
    }

    return errors.result();
}

const sudoku_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    [solving_state.board.every(
        row => row.every(cell => cell.number !== null)
    ), []];

const row_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (row, index) => [row, index] as Position);

const column_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (col, index) => [index, col] as Position);

const box_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (box, index) =>
        [(Math.floor(box / 3) * 3 + Math.floor(index / 3)), (box % 3) * 3 + (index % 3)] as Position
    );

const segment_check: RuleCheckingFunction<SegmentRule> = (solving_state: SolvingState, rule: SegmentRule): RuleCheckingResult =>
    generic_duplicate_check(solving_state, (region, index) =>
        rule.render_state.regions[region][index]
    );

const distant_check: PureCheckingFunction = (solving_state: SolvingState): RuleCheckingResult =>
    generic_pair_check(solving_state, king_adjacent);

const link_check: RuleCheckingFunction<LinkRule> = function (
    solving_state: SolvingState, rule: LinkRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const cell1 = solving_state.board[r1][c1];
        const cell2 = solving_state.board[r2][c2];
        if (cell1.number === null || cell2.number === null) continue;
        if (Math.abs(cell1.number - cell2.number) != 1) {
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        }
    }

    return errors.result();
}

const lotus_check: RuleCheckingFunction<LotusRule> = function (
    solving_state: SolvingState, rule: LotusRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c] of rule.render_state.cells) {
        const value = solving_state.board[r][c].number;
        if (value === null) continue;

        const neighbors: Position[] = adjacent
            .map(([dr, dc]): [number, number] => [r + dr, c + dc])
            .filter(is_pos);

        let has_greater = false, has_smaller = false, has_same = false;

        for (const [nr, nc] of neighbors) {
            const num = solving_state.board[nr][nc].number;
            if (num === null) continue;

            if (num > value) has_greater = true;
            if (num < value) has_smaller = true;
            if (num === value) has_same = true;

            if (has_greater && has_smaller || has_same) {
                errors.add([r, c]);
                break;
            }
        }
    }

    return errors.result();
}

const metro_check: RuleCheckingFunction<MetroRule> = function (
    solving_state: SolvingState, rule: MetroRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const metro of rule.render_state.metros) {
        const nums: number[] = [];

        for (const [r, c] of metro) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue;
            nums.push(value);
        }

        if (new Set(nums).size !== nums.length) {
            errors.add_all(metro);
            continue;
        }

        const min = Math.min(...nums), max = Math.max(...nums);
        if (max - min + 1 > metro.length) {
            errors.add_all(metro);
        }
    }

    return errors.result();
}

const sequence_check: RuleCheckingFunction<SequenceRule> = function (
    solving_state: SolvingState, rule: SequenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, sequence] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);

        let j = 0;
        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null || v === sequence[j]) j++;
            if (j >= sequence.length) break;
        }

        if (j !== sequence.length) {
            errors.add_direction(direction, index);
        }
    }

    return errors.result();
}

const quantum_check: RuleCheckingFunction<QuantumRule> = function (
    solving_state: SolvingState, rule: QuantumRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [a, b]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const [r1, c1] = get_pos(digit_to_coord(a)), [r2, c2] = get_pos(digit_to_coord(b));
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        const cond1 = v1 == b, cond2 = v2 == a;
        if (cond1 === cond2) {
            errors.add(get_pos(digit_to_coord(a)));
            errors.add(get_pos(digit_to_coord(b)));
            errors.add_direction(direction, index);
        }
    }

    return errors.result();
}

const range_check: RuleCheckingFunction<RangeRule> = function (
    solving_state: SolvingState, rule: RangeRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, [distance]] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);
        const one_pos: BoardCoord[] = [], nine_pos: BoardCoord[] = [];

        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === 1) one_pos.push(i);
            if (v === 9) nine_pos.push(i);
        }

        function can_be([r, c]: Position, target: Digit) {
            const value = solving_state.board[r][c].number;
            return value === null || value === target;
        }

        for (const one of one_pos) {
            const i1 = one - distance, i2 = one + distance;
            if (is_coord(i1) && can_be(get_pos(i1), 9)) continue;
            if (is_coord(i2) && can_be(get_pos(i2), 9)) continue;
            errors.add(get_pos(one));
            errors.add_direction(direction, index);
        }
        for (const nine of nine_pos) {
            const i1 = nine - distance, i2 = nine + distance;
            if (is_coord(i1) && can_be(get_pos(i1), 1)) continue;
            if (is_coord(i2) && can_be(get_pos(i2), 1)) continue;
            errors.add(get_pos(nine));
            errors.add_direction(direction, index);
        }

        for (const one of one_pos) {
            for (const nine of nine_pos) {
                if (Math.abs(one - nine) === distance) continue;
                errors.add(get_pos(one));
                errors.add(get_pos(nine));
                errors.add_direction(direction, index);
            }
        }
    }

    return errors.result();
}

const quad_check: PureCheckingFunction = function (
    solving_state: SolvingState,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c] of position_generator([0, 0], [7, 7])) {
        const positions: Position[] = [[r, c], [r, c + 1], [r + 1, c], [r + 1, c + 1]] as Position[];
        let has_even = false, has_odd = false;

        for (const [i, j] of positions) {
            const v = solving_state.board[i][j].number;
            if (v === null) {
                has_even = has_odd = true;
                break;
            }
            if (v % 2 === 0) has_even = true;
            if (v % 2 === 1) has_odd = true;
        }

        if (!(has_even && has_odd)) {
            errors.add_all(positions);
        }
    }

    return errors.result();
}

const reference_check: RuleCheckingFunction<ReferenceRule> = function (
    solving_state: SolvingState, rule: ReferenceRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index] of rule.render_state.lines) {
        const get_pos = generate_get_pos(direction, index);
        for (const i of board_coords) {
            const [r, c] = get_pos(i);
            const v = solving_state.board[r][c].number;
            if (v === null) continue;

            const get_reference_pos = generate_get_pos(direction, digit_to_coord(v));
            const [ref_r, ref_c] = get_reference_pos(i);
            const ref_v = solving_state.board[ref_r][ref_c].number;
            if (ref_v !== null && ref_v !== index + 1) {
                errors.add(get_pos(i));
                errors.add(get_reference_pos(i));
            }
        }
    }

    return errors.result();
}

const square_first = new Set([1, 2, 3, 4, 6, 8]);
const square_second = new Set([1, 4, 5, 6, 9]);
const prime_second = new Set([1, 3, 7, 9]);
const square_numbers = new Set([16, 25, 36, 49, 64, 81]);
const prime_numbers = new Set([11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97]);

const prism_check: RuleCheckingFunction<PrismRule> = function (
    solving_state: SolvingState, rule: PrismRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r1, c1, r2, c2, type] of rule.render_state.edges) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;

        if (v1 === null && v2 === null) continue;
        if (v1 !== null && v2 === null) {
            if (type ? true : square_first.has(v1)) continue;
        }
        if (v1 === null && v2 !== null) {
            if (type ? prime_second.has(v2) : square_second.has(v2)) continue;
        }
        if (v1 !== null && v2 !== null) {
            const num = v1 * 10 + v2;
            if (type ? prime_numbers.has(num): square_numbers.has(num)) continue;
        }
        errors.add([r1, c1]);
        errors.add([r2, c2]);
    }

    return errors.result();
}

const temperature_check: RuleCheckingFunction<TemperatureRule> = function (
    solving_state: SolvingState, rule: TemperatureRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const {cells, color} of rule.render_state.regions) {
        let sum = 0;
        let remaining = 3;
        for (const [r, c] of cells) {
            const value = solving_state.board[r][c].number;
            if (value === null) continue;
            sum += value;
            remaining--;
        }
        if ((sum + remaining) <= 10 && color == 'blue') continue;
        if (remaining <= Math.abs(15 - sum) && Math.abs(15 - sum) <= remaining * 9 && color == 'green') continue;
        if ((sum + remaining * 9) >= 20 && color == 'red') continue;
        errors.add_all(cells);
    }

    return errors.result();
}

const root_check: RuleCheckingFunction<RootRule> = function (
    solving_state: SolvingState, rule: RootRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c, distance] of rule.render_state.cells) {
        const value = solving_state.board[r][c].number;
        if (value === null) continue;

        let has_exact = false, has_close = false;
        for (let nr = 0; nr < 9; nr++) {
            for (let nc = 0; nc < 9; nc++) {
                const d = (r - nr) ** 2 + (c - nc) ** 2;
                if (d > distance || d === 0) continue;
                const v = solving_state.board[nr][nc].number;
                if (d === distance && (v === null || v === value)) has_exact = true;
                if (d < distance && v === value) has_close = true;
            }
        }

        if (!has_exact || has_close) {
            errors.add([r, c]);
        }
    }

    return errors.result();
}

const point_check: RuleCheckingFunction<PointRule> = function (
    solving_state: SolvingState, rule: PointRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;

        if (v1 >= v2) {
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        }
    }

    return errors.result();
}

function match_piece(solving_state: SolvingState, positions: [Position, Digit][]): Position[] {
    const max_row = positions.reduce(
        (mx, [[r, _c], _v]): BoardCoord => Math.max(mx, r) as BoardCoord,
        0 as BoardCoord
    );
    const max_col = positions.reduce(
        (mx, [[_r, c], _v]): BoardCoord => Math.max(mx, c) as BoardCoord,
        0 as BoardCoord
    );

    for (const [r, c] of position_generator([0, 0], [max_row, max_col])) {
        if (positions.every(
            ([[dr, dc], v]) =>
                solving_state.board[r + dr][c + dc].number === v
        )) {
            return positions.map(([[dr, dc], _]: [Position, Digit]): Position => [r + dr, c + dc] as Position);
        }
    }
    return [];
}

const stencil_check: RuleCheckingFunction<StencilRule> = function (
    solving_state: SolvingState, rule: StencilRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const {values} of rule.render_state.pieces) {
        const positions: [Position, Digit][] = [];
        let max_row: BoardCoord = 0, max_col: BoardCoord = 0;
        for (const key in values) {
            const [r, c] = key.split(',').map(Number) as Position;
            const v = values[key]!;
            max_row = Math.max(max_row, r) as BoardCoord;
            max_col = Math.max(max_col, c) as BoardCoord;
            positions.push([[r, c], v]);
        }

        const transforms: (([p, n]: [Position, Digit]) => [Position, Digit])[] = [
            ([[r, c], n]) => [[r, c], n],
            ([[r, c], n]) => [[max_row - r, c] as Position, n],
            ([[r, c], n]) => [[r, max_col - c] as Position, n],
            ([[r, c], n]) => [[max_row - r, max_col - c] as Position, n],
        ];

        const transpose: (b: boolean) => ([p, n]: [Position, Digit]) => [Position, Digit] =
            (b) => ([[r, c], n]) => b ? [[c, r], n] : [[r, c], n];

        for (let i = 0; i < 8; i++) {
            const new_positions = positions.map(transforms[i % 4]);
            errors.add_all(match_piece(solving_state, new_positions.map(transpose(i >= 4))));
        }
    }

    return errors.result();
}

const direction_map: Record<"L" | "R" | "U" | "D", [number, number]> = {
    "L": [0, -1],
    "R": [0, 1],
    "U": [-1, 0],
    "D": [1, 0],
};

const vector_check: RuleCheckingFunction<VectorRule> = function (
    solving_state: SolvingState, rule: VectorRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r, c, direction] of rule.render_state.arrows) {
        const v = solving_state.board[r][c].number;
        if (v === null) continue;
        const [dr, dc] = direction_map[direction];
        const nr = r + dr * v, nc = c + dc * v;
        if (!(is_coord(nr) && is_coord(nc))) {
            errors.add([r, c]);
            continue;
        }
        const other_v = solving_state.board[nr][nc].number;
        if (other_v !== null && other_v !== 9) {
            errors.add([r, c]);
            errors.add([nr, nc]);
        }
    }

    return errors.result();
}

const stream_check: RuleCheckingFunction<StreamRule> = function (
    solving_state: SolvingState, rule: StreamRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const stream of rule.render_state.streams) {
        let remainder: number | null = null;
        for (const [r, c] of stream) {
            if (remainder !== null) remainder ^= 1;
            const v = solving_state.board[r][c].number;
            if (v === null) continue;
            if (remainder === null) {
                remainder = v % 2;
            } else if (v % 2 !== remainder) {
                errors.add_all(stream);
                break;
            }
        }
    }

    return errors.result();
}

const pair_check: RuleCheckingFunction<PairRule> = function (
    solving_state: SolvingState, rule: PairRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const pairs: Record<number, [Position, Position]> = {};
    for (const [[r1, c1], [r2, c2]] of rule.render_state.dominoes) {
        const v1 = solving_state.board[r1][c1].number;
        const v2 = solving_state.board[r2][c2].number;
        if (v1 === null || v2 === null) continue;
        const n = Math.min(v1, v2) * 10 + Math.max(v1, v2);
        if (n in pairs) {
            errors.add_all(pairs[n]);
            errors.add([r1, c1]);
            errors.add([r2, c2]);
        } else {
            pairs[n] = [[r1, c1], [r2, c2]];
        }
    }

    return errors.result();
}

const inversion_check: RuleCheckingFunction<InversionRule> = function (
    solving_state: SolvingState, rule: InversionRule
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const line of rule.render_state.lines) {
        let min_num = 0;
        let inversion_count = 0;
        let can_invert = false;

        const nums = line.map(([r, c]) => solving_state.board[r][c].number);
        const len = nums.length;
        for (let i = 0; i < nums.length; i++) {
            const v = nums[i];
            if (v === null) {
                if (!((i === len - 1 || nums[i + 1] === 9) && (i === 0 || nums[i - 1] === 1))) can_invert = true;
                continue;
            }
            if (v < min_num) inversion_count++;
            min_num = v;
        }

        if (inversion_count >= 2 || inversion_count === 0 && !can_invert) {
            errors.add_all(line);
        }
    }

    return errors.result();
}

const escape_check: PureCheckingFunction = function (solving_state: SolvingState): RuleCheckingResult {
    const errors = create_error_collector();
    const encode: (p: Position) => string = ([r, c]) => `${r},${c}`;
    const visited = new Set<string>();

    function bfs(pos: Position): Position[] {
        const queue: Position[] = [pos];
        visited.add(encode(pos));
        let head = 0;
        while (head < queue.length) {
            const [r, c] = queue[head++];
            const neighbors: Position[] = adjacent
                .map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(is_pos);
            for (const [nr, nc] of neighbors) {
                if (visited.has(encode([nr, nc]))) continue;
                const v = solving_state.board[nr][nc].number;
                if ((v === null || v % 2 === 0)) {
                    queue.push([nr, nc]);
                    visited.add(encode([nr, nc]));
                }
            }
        }
        return queue;
    }

    loop: for (const [r, c] of position_generator()) {
        if (visited.has(encode([r, c]))) continue;
        const v = solving_state.board[r][c].number;
        if (v === null || v % 2 !== 0) continue;

        const region = bfs([r, c]);
        for (const [nr, _] of region) {
            if (nr === 0 || nr === 8) continue loop;
        }

        errors.add_all(region);
    }

    return errors.result();
}

const trail_check: RuleCheckingFunction<TrailRule> = function (
    solving_state: SolvingState, rule: TrailRule
): RuleCheckingResult {
    const errors = create_error_collector();

    const result = trail_sat_solve(solving_state.board);
    if (!result) {
        errors.add(rule.render_state.start);
        errors.add(rule.render_state.end);
    }

    return errors.result();
}

const triplet_check: PureCheckingFunction = function (solving_state: SolvingState): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [r2, c2] of position_generator([1, 1], [7, 7])) {
        const v2 = solving_state.board[r2][c2].number;
        if (v2 === null) continue;
        for (const [r1, c1, r3, c3] of [
            [r2 - 1, c2 - 1, r2 + 1, c2 + 1],
            [r2 - 1, c2 + 1, r2 + 1, c2 - 1],
        ] as BoardCoord[][]) {
            const v1 = solving_state.board[r1][c1].number;
            const v3 = solving_state.board[r3][c3].number;
            if (v1 === null || v3 === null) continue;
            if (v1 < v2 && v2 < v3 || v1 > v2 && v2 > v3) {
                errors.add([r1, c1]);
                errors.add([r2, c2]);
                errors.add([r3, c3]);
            }
        }
    }

    return errors.result();
}

const epsilon_check: PureCheckingFunction = function (solving_state: SolvingState): RuleCheckingResult {
    const errors = create_error_collector();
    const encode: (p: Position) => string = ([r, c]) => `${r},${c}`;

    function bfs(pos: Position): [Position[], Position[]] {
        const queue: [Position, number][] = [[pos, 0]];
        const visited = new Set<string>();
        visited.add(encode(pos));
        let head = 0;
        while (head < queue.length) {
            const [[r, c], step] = queue[head++];
            const neighbors: Position[] = adjacent
                .map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(is_pos);
            for (const [nr, nc] of neighbors) {
                const nk = encode([nr, nc]);
                if (visited.has(nk)) continue;
                const v = solving_state.board[nr][nc].number;
                if (v !== null && v <= 4) {
                    queue.push([[nr, nc], step === 0 ? 0 : 2]);
                    visited.add(nk);
                }
                if (step < 2 && v === null) {
                    queue.push([[nr, nc], 1]);
                    visited.add(nk);
                }
            }
        }
        console.log(queue);
        return [queue.filter(([_, b]) => b === 0).map(([p, _]) => p), queue.filter(([_, b]) => b !== 0).map(([p, _]) => p)];
    }

    for (const [r, c] of position_generator()) {
        const v = solving_state.board[r][c].number;
        if (v === null || v >= 5) continue;
        const [epsilon, candidate] = bfs([r, c]);
        if (epsilon.length > 3) {
            errors.add_all(epsilon);
        }
        if (epsilon.length + candidate.length < 3) {
            errors.add_all(epsilon);
            errors.add_all(candidate);
        }
    }

    return errors.result();
}

const two_product = new Set([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    12, 14, 15, 16, 18, 20, 21, 24, 25, 27,
    28, 30, 32, 35, 36, 40, 42, 45, 48, 49,
    54, 56, 63, 64, 72, 81,
]);

const product_check: RuleCheckingFunction<ProductRule> = function (
    solving_state: SolvingState, rule: ProductRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    for (const [direction, index, number] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos_extended(direction, index);
        let product = 1;
        let count = 0;
        const positions = ([0, 1, 2] as BoardCoord[]).map(get_pos);
        for (const [r, c] of positions) {
            const v = solving_state.board[r][c].number;
            if (v === null) continue;
            product *= v;
            count++;
        }

        const q = Math.floor(number / product);
        const r = number % product;

        if (count === 3 && product === number) continue;
        if (count === 2 && r === 0 && 1 <= q && q <= 9) continue;
        if (count === 1 && r === 0 && two_product.has(q)) continue;
        if (count === 0) continue;

        errors.add_all(positions);
        errors.add_direction(direction, index);
    }

    return errors.result();
}

const bumper_check: PureCheckingFunction = function (solving_state: SolvingState): RuleCheckingResult {
    const errors = create_error_collector();

    const bumper: (boolean | null)[][] = Array.from( {length: 9}, _ => Array(9).fill(null) );
    for (const [r, c] of position_generator()) {
        const v = solving_state.board[r][c].number;
        let possible = v === null ? new Set<Digit>(digits) : new Set<Digit>([v]);
        let filled_count = 0;
        const neighbors = adjacent.map(([dr, dc]) => [r + dr, c + dc] as [number, number]).filter(is_pos);
        for (const [nr, nc] of neighbors) {
            const nv = solving_state.board[nr][nc].number;
            if (nv === null) continue;
            filled_count++;
            for (let i = nv - 2; i <= nv + 2; i++) {
                if (is_digit(i)) possible.delete(i);
            }
        }
        if (v !== null && filled_count === neighbors.length) {
            bumper[r][c] = possible.size > 0;
        } else {
            bumper[r][c] = possible.size > 0 ? null : false;
        }
    }

    for (const direction of ["ROW", "COL"] as const) {
        for (const index of board_coords) {
            const get_pos = generate_get_pos(direction, index);
            const bumper_pos: Position[] = [];
            let possible_count = 0;
            for (const i of board_coords) {
                const [r, c] = get_pos(i);
                const b = bumper[r][c];
                if (b === true) bumper_pos.push([r, c]);
                if (b !== false) possible_count += 1;
            }

            if (bumper_pos.length > 1) {
                errors.add_all(bumper_pos);
            }
            if (possible_count < 1) {
                errors.add_all(board_coords.map(get_pos));
            }
        }
    }

    return errors.result();
}

const bridge_check: RuleCheckingFunction<BridgeRule> = function (
    solving_state: SolvingState, rule: BridgeRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const encode = ([r, c]: Position, n: Digit | null): number =>
        r * 100 + c * 10 + (n ?? 0);

    const min_row: number[] = Array(9).fill(-1);

    function dfs(stack: Position[], n: Digit | null, visited: Set<number>): Position[] | null {
        const [r, c] = stack[stack.length - 1];
        const v = solving_state.board[r][c].number;
        if (r <= min_row[c]) return null;
        if (n !== null && v !== null && n !== v) return null;
        if (c === 8) return stack;

        const current = n ?? v;

        if (visited.has(encode([r, c], current)) || visited.has(encode([r, c], null))) return null;
        visited.add(encode([r, c], current));

        const nc = c + 1;
        for (const nr of [r - 1, r, r + 1]) {
            const np = [nr, nc] as [number, number];
            if (!is_pos(np)) continue;
            stack.push(np);
            const result = dfs(stack, current === null ? null : (current % 9 + 1 as Digit), visited);
            if (result !== null) return result;
            stack.pop();
        }
        return null;
    }

    for (const start of rule.render_state.start_rows) {
        const result = dfs([[start, 0]], null, new Set<number>());
        console.log(result);
        if (result === null) {
            errors.add([start, 0]);
        } else {
            result.forEach(([r, c]) => { min_row[c] = Math.max(min_row[c], r) });
        }
    }

    return errors.result();
}

const reflex_check: RuleCheckingFunction<ReflexRule> = function (
    solving_state: SolvingState, rule: ReflexRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const encode = ([r, c]: Position): number => r * 10 + c;
    const set = new Set<number>(rule.render_state.marked_cells.map(encode));

    next: for (const [r, c] of rule.render_state.marked_cells) {
        const v = solving_state.board[r][c].number;

        let null_count = 0;
        const counts = Array(10).fill(0);
        const neighbors = king_adjacent
            .map(([dr, dc]) => [r + dr, c + dc] as [number, number])
            .filter(is_pos)
            .filter(p => set.has(encode(p)));
        for (const [nr, nc] of neighbors) {
            const nv = solving_state.board[nr][nc].number;
            if (nv === null) {
                null_count++;
            } else {
                counts[nv]++;
            }
        }

        let sum = 0;
        const prefix = counts.map(x => sum += x);
        for (const i of digits) {
            if (v !== null && v !== i) continue;
            if (prefix[i] <= (i - 1) && (i - 1) <= prefix[i] + null_count) continue next;
        }

        errors.add([r, c]);
    }

    return errors.result();
}

const aquarium_check: RuleCheckingFunction<AquariumRule> = function (
    solving_state: SolvingState, rule: AquariumRule,
): RuleCheckingResult {
    const errors = create_error_collector();

    const encode = ([r, c]: Position): number => (r * 10 + c);
    for (const region of rule.render_state.regions) {
        const set = new Set<number>(region.map(encode));
        let prev_max = 0, curr_max;
        for (const r of board_coords) {
            curr_max = prev_max;
            for (const c of board_coords) {
                if (!set.has(encode([r, c]))) continue;
                const v = solving_state.board[r][c].number;
                if (prev_max === 9 || v !== null && v <= prev_max) {
                    errors.add([r, c]);
                }
                curr_max = Math.max(curr_max, v ?? 0, (prev_max + 1));
            }
            prev_max = curr_max;
        }
    }

    return errors.result();
}

const rule_checks: Record<RuleID, (state: SolvingState, rule: Rule) => RuleCheckingResult> = {
    "[Sudoku]": sudoku_check,
    "[R]": row_check,
    "[C]": column_check,
    "[B]": box_check,
    "[DT]": distant_check,
    "[QD]": quad_check,
    "[ES]": escape_check,
    "[TP]": triplet_check,
    "[EP]": epsilon_check,
    "[BP]": bumper_check,
    "[SG]": (state, rule) => segment_check(state, rule as SegmentRule),
    "[LK]": (state, rule) => link_check(state, rule as LinkRule),
    "[LO]": (state, rule) => lotus_check(state, rule as LotusRule),
    "[MR]": (state, rule) => metro_check(state, rule as MetroRule),
    "[RF]": (state, rule) => reference_check(state, rule as ReferenceRule),
    "[PR]": (state, rule) => prism_check(state, rule as PrismRule),
    "[QT]": (state, rule) => quantum_check(state, rule as QuantumRule),
    "[RG]": (state, rule) => range_check(state, rule as RangeRule),
    "[SQ]": (state, rule) => sequence_check(state, rule as SequenceRule),
    "[TM]": (state, rule) => temperature_check(state, rule as TemperatureRule),
    "[RT]": (state, rule) => root_check(state, rule as RootRule),
    "[PO]": (state, rule) => point_check(state, rule as PointRule),
    "[ST]": (state, rule) => stencil_check(state, rule as StencilRule),
    "[VT]": (state, rule) => vector_check(state, rule as VectorRule),
    "[SR]": (state, rule) => stream_check(state, rule as StreamRule),
    "[PA]": (state, rule) => pair_check(state, rule as PairRule),
    "[IV]": (state, rule) => inversion_check(state, rule as InversionRule),
    "[TR]": (state, rule) => trail_check(state, rule as TrailRule),
    "[PD]": (state, rule) => product_check(state, rule as ProductRule),
    "[BD]": (state, rule) => bridge_check(state, rule as BridgeRule),
    "[EF]": (state, rule) => reflex_check(state, rule as ReflexRule),
    "[AQ]": (state, rule) => aquarium_check(state, rule as AquariumRule),
} as const;

export function check_all(
    solving_state: SolvingState, rules: Rule[]
): [boolean, Partial<Record<RuleID, PositionExtended[]>>] {
    let correct = true;
    const errors: Partial<Record<RuleID, PositionExtended[]>> = {};

    for (const rule of rules) {
        const id = rule.id;
        const [c, e] = rule_checks[id](solving_state, rule);
        if (!c) correct = false;
        errors[id] = e;
    }

    return [correct, errors];
}
