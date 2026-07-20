import {
    type LinkRule,
    type LotusRule,
    type MetroRule,
    type PrismRule,
    type QuantumRule,
    type RangeRule,
    type ReferenceRule,
    type RootRule,
    type SegmentRule,
    type SequenceRule,
    type TemperatureRule,
    type Rule,
    type RuleID,
    type SideRule,
    type PointRule, type VectorRule, type StreamRule, type PairRule, type InversionRule, type Position, type Direction,
    type TrailRule, type DirectionExtended, type ProductRule, type BridgeRule, type ReflexRule, type AquariumRule,
    is_pos, type MetaRule, type PrismPrimeRule, type LinkPrimeRule, type LotusPrimeRule, type RootPrimeRule,
    type SequencePrimeRule, type RangePrimeRule, type TrailPrimeRule, type SegmentPrimeRule, type BoxPrimeRule,
    generate_positions, type VectorPrimeRule,
} from "./schema.ts";

type RenderContext = {
    layer_bottom: SVGSVGElement,
    layer_middle: SVGSVGElement,
    layer_top: SVGSVGElement,
}

type PureRenderer = (ctx: RenderContext) => void;
type Renderer<T extends Rule, A extends unknown[] = []> = (ctx: RenderContext, rule: T, ...args: A) => void;

type Coordinate = [number, number];

function pos_to_coord([r, c]: Position): Coordinate {
    return [c + 0.5, r + 0.5];
}

function generate_circle([x, y]: Coordinate): SVGCircleElement {
    const circle = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
    );
    circle.setAttribute("cx", x.toString());
    circle.setAttribute("cy", y.toString());
    return circle;
}

function generate_line([x1, y1]: Coordinate, [x2, y2]: Coordinate) {
    const line = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "line"
    );

    line.setAttribute("x1", x1.toString());
    line.setAttribute("y1", y1.toString());
    line.setAttribute("x2", x2.toString());
    line.setAttribute("y2", y2.toString());
    return line;
}

interface PolyResult {
    polyline: SVGPolylineElement,
    polygon: SVGPolygonElement,
}
function generate_poly<T extends "polyline" | "polygon">(coords: Coordinate[], type: T): PolyResult[T] {
    const points: string[] = [];
    for (const [x, y] of coords) {
        points.push(`${x},${y}`);
    }

    const poly = document.createElementNS(
        "http://www.w3.org/2000/svg",
        type
    );
    poly.setAttribute("points", points.join(' '));
    poly.setAttribute("fill", "none");

    return poly;
}

function generate_polyline(positions: Coordinate[]): SVGPolylineElement {
    return generate_poly(positions, "polyline");
}

function generate_polygon(positions: Coordinate[]): SVGPolygonElement {
    return generate_poly(positions, "polygon");
}

function generate_cage(region: Position[], inset: number = 0): SVGPathElement {
    const encode_pos = ([r, c]: Position): number => r * 10 + c;
    const encode_coord = ([r, c]: Coordinate): number => r * 10 + c;
    const equal_coord = ([r1, c1]: Coordinate, [r2, c2]: Coordinate): boolean => r1 === r2 && c1 === c2;

    const directions: Coordinate[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
    const first: Coordinate[] = [[1, 0], [-1, 1], [-2, -1], [0, -2]];
    const second: Coordinate[] = [[1, -1], [0, 1], [-2, 0], [-1, -2]];

    const add = ([r, c]: Coordinate, [dr, dc]: Coordinate): Coordinate => [r + dr, c + dc];
    const sub = ([r1, c1]: Coordinate, [r2, c2]: Coordinate): Coordinate => [r1 - r2, c1 - c2];

    const adjacent: Coordinate[] = [[0, 0], [0, 1], [1, 0], [1, 1]];

    const vertex_map: Partial<Record<number, number>> = {};
    for (const [r, c] of region) {
        for (const coord of adjacent.map(([dr, dc]) => [r + dr, c + dc]) as Coordinate[]) {
            const key = encode_coord(coord);
            if (vertex_map[key] === undefined) {
                vertex_map[key] = 1;
                continue;
            }
            vertex_map[key]++;
            if (vertex_map[key] === 4) {
                delete vertex_map[key];
            }
        }
    }

    const set = new Set<number>(region.map(encode_pos));
    const paths: string[] = [];

    let is_first = true;
    for (let i = 0; i <= 9; i++) {
        for (let j = 0; j <= 9; j++) {
            const key = encode_coord([i, j]);
            if (vertex_map[key] === undefined) continue;
            const start_pos: Coordinate = [i, j];
            let pos: Coordinate = start_pos;
            let dir = is_first ? 0 : 1;
            is_first = false;
            const move = (rotate: number) => {
                pos = add(pos, directions[dir]);
                dir = (dir + rotate + 4) % 4;
            };

            const path: Coordinate[] = [];
            do {
                console.log(pos, dir);
                path.push(pos);
                delete vertex_map[encode_coord(pos)];
                const next1 = add(pos, first[dir]);
                const next2 = add(pos, second[dir]);
                if (!is_pos(next1) || !set.has(encode_pos(next1))) {
                    move(1);
                } else if (!is_pos(next2) || !set.has(encode_pos(next2))) {
                    move(0);
                } else {
                    move(-1);
                }
            } while (!equal_coord(pos, start_pos));

            const len = path.length;
            let path_string = "";
            for (const [i, pos] of path.entries()) {
                let shift: Coordinate = [0, 0];
                for (const [dr, dc] of adjacent) {
                    const new_pos = add(pos, [dr - 1, dc - 1]);
                    if (is_pos(new_pos) && set.has(encode_pos(new_pos))) {
                        shift = add(shift, [dr - 0.5, dc - 0.5]);
                    }
                }
                if (equal_coord(shift, [0, 0])) {
                    for (const j of [(i + 1) % len, (i - 1 + len) % len]) {
                        shift = add(shift, sub(path[j], pos));
                    }
                }
                shift = shift.map(x => Math.max(-inset, Math.min(inset, x))) as Coordinate;
                path_string += `${i === 0 ? "M" : "L"} ${pos[1] + shift[1]} ${pos[0] + shift[0]} `;
            }
            console.log(path_string);
            paths.push(path_string + "Z");
        }
    }

    const path_element = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
    );
    path_element.setAttribute("d", paths.join("\n"));
    path_element.setAttribute("fill-rule", "evenodd");

    return path_element;
}

const nothing_render = () => {};

const sudoku_render: PureRenderer = function (ctx: RenderContext) {
    for (let i = 0; i < 20; i++) {
        const [x1, x2, y1, y2] = i >= 10 ? [0.025, 9, i % 10, i % 10] : [i % 10, i % 10, 0.025, 9];

        const line = generate_line([x1, y1], [x2, y2]);
        line.setAttribute("stroke", "#aaa");
        line.setAttribute("stroke-width", "0.01");
        line.setAttribute("stroke-dasharray", "0.15 0.05");

        ctx.layer_middle.appendChild(line);
    }
}

function draw_row(ctx: RenderContext, color: string) {
    const d = 0.035;
    for (let i = 0; i <= 9; i++) {
        const line = generate_line([-d / 2, i], [9 + d / 2, i]);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", d.toString());

        ctx.layer_middle.appendChild(line);
    }
}

const row_render: PureRenderer = (ctx: RenderContext) => draw_row(ctx, "#777");

const row_prime_render: PureRenderer = (ctx: RenderContext) => draw_row(ctx, "rgb(170, 119, 119)")

const column_render: PureRenderer = function (ctx: RenderContext) {
    const d = 0.035;
    for (let i = 0; i <= 9; i++) {
        const line = generate_line([i, -d / 2], [i, 9 + d / 2]);
        line.setAttribute("stroke", "#777");
        line.setAttribute("stroke-width", d.toString());

        ctx.layer_middle.appendChild(line);
    }
}

function draw_box(ctx: RenderContext, color: string) {
    const d = 0.06;
    for (let i = 0; i < 8; i++) {
        const i3 = (i % 4) * 3;
        const [x1, x2, y1, y2] = i >= 4 ? [-d / 2, 9 + d / 2, i3, i3] : [i3, i3, -d / 2, 9 + d / 2];

        const line = generate_line([x1, y1], [x2, y2]);
        line.setAttribute("stroke", color);
        line.setAttribute("stroke-width", "0.06");

        ctx.layer_middle.appendChild(line);
    }
}

const box_render: PureRenderer = (ctx: RenderContext) => draw_box(ctx, "#000")

const box_prime_render: Renderer<BoxPrimeRule> = function (ctx: RenderContext, rule: BoxPrimeRule) {
    draw_box(ctx, "rgb(127, 0, 0)");

    for (const [r, c] of generate_positions()) {
        if ((r + c) % 2 === 1) continue;

        const rect = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
        );
        rect.setAttribute("x", c.toString());
        rect.setAttribute("y", r.toString());
        rect.setAttribute("width", "1");
        rect.setAttribute("height", "1");
        rect.setAttribute("stroke", "none");
        rect.setAttribute("fill", "rgba(234, 255, 128, 0.25)");
        ctx.layer_bottom.appendChild(rect);
    }

    for (const [i, [a, b]] of rule.render_state.hints.entries()) {
        const text = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
        );
        text.textContent = `${a} ${b}`;
        text.setAttribute("x", `${i % 3 * 3 + 0.07}`);
        text.setAttribute("y", `${i - i % 3 + 0.07}`);
        text.setAttribute("dominant-baseline", "hanging");
        text.setAttribute("font-size", "0.2");
        text.setAttribute("font-weight", "bold");
        text.setAttribute("fill", "rgba(31, 31, 31, 0.5)");
        ctx.layer_middle.appendChild(text);
    }
}

const segment_render: Renderer<SegmentRule> = function (ctx: RenderContext, rule: SegmentRule) {
    for (const region of rule.render_state.regions) {
        const path = generate_cage(region);
        path.setAttribute("fill", "none");
        path.setAttribute("stroke", "black");
        path.setAttribute("stroke-width", "0.06");
        ctx.layer_middle.appendChild(path);
    }
}

const link_render: Renderer<LinkRule> = function (ctx: RenderContext, rule: LinkRule) {
    const d = 0.13;
    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const cx = (c1 + c2 + 1) / 2, cy = (r1 + r2 + 1) / 2;
        const points: Coordinate[] = [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]];
        const poly = generate_polygon(points);
        poly.setAttribute("fill", "white");
        poly.setAttribute("stroke", "black");
        poly.setAttribute("stroke-width", "0.03");

        ctx.layer_top.appendChild(poly);
    }
}

const lotus_render: Renderer<LotusRule, [string?]> = function (
    ctx: RenderContext, rule: LotusRule, color: string = "rgb(189, 235, 107)",
) {
    for (const [r, c] of rule.render_state.cells) {
        const circle = generate_circle(pos_to_coord([r, c]));

        circle.setAttribute("r", "0.3");
        circle.setAttribute("fill", color);
        circle.setAttribute("fill-opacity", "0.5");
        circle.setAttribute("stroke", color);
        circle.setAttribute("stroke-width", "0.05");

        ctx.layer_bottom.appendChild(circle);
    }
}

const metro_render: Renderer<MetroRule> = function (ctx: RenderContext, rule: MetroRule) {
    const length = rule.render_state.metros.length;
    for (const [i, metro] of rule.render_state.metros.entries()) {
        const color = `hsla(${360 / length * i}, 90%, 45%, 0.4)`;
        for (const [r, c] of metro) {
            const circle = generate_circle(pos_to_coord([r, c]));
            circle.setAttribute("r", "0.06");
            circle.setAttribute("fill", color);
            ctx.layer_bottom.appendChild(circle);
        }

        const poly = generate_polyline(metro.map(pos_to_coord));
        poly.setAttribute("stroke", color);
        poly.setAttribute("stroke-width", "0.12");
        poly.setAttribute("stroke-linejoin", "round");
        poly.setAttribute("stroke-linecap", "round");

        ctx.layer_bottom.appendChild(poly);
    }
}

const stream_render: Renderer<StreamRule> = function (ctx: RenderContext, rule: StreamRule) {
    for (const stream of rule.render_state.streams) {
        const g = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g"
        );
        g.setAttribute("opacity", "0.5");

        const d = 0.35, d2 = d / 2;

        const outside_functions: ((p: Position) => [boolean, Coordinate, Coordinate])[] = [
            ([r, c]) => [r === 0, [c + 0.5, 0.5 + d2], [c + 0.5, 0]],
            ([r, c]) => [r === 8, [c + 0.5, 8.5 - d2], [c + 0.5, 9]],
            ([r, c]) => [c === 0, [0.5 + d2, r + 0.5], [0, r + 0.5]],
            ([r, c]) => [c === 8, [8.5 - d2, r + 0.5], [9, r + 0.5]],
        ]
        for (const pos of [stream[0], stream[stream.length - 1]]) {
            for (const outside of outside_functions) {
                const [condition, coord1, coord2] = outside(pos);
                if (!condition) continue;
                const line = generate_line(coord1, coord2);
                line.setAttribute("stroke", "rgb(97, 217, 245)");
                line.setAttribute("stroke-width", d.toString());
                g.appendChild(line);
            }
        }

        const poly = generate_polyline(stream.map(pos_to_coord));
        poly.setAttribute("stroke", "rgb(97, 217, 245)");
        poly.setAttribute("stroke-width", d.toString());

        g.appendChild(poly);
        ctx.layer_bottom.appendChild(g);
    }
}

const inversion_render: Renderer<InversionRule> = function (ctx: RenderContext, rule: InversionRule) {
    for (const line of rule.render_state.lines) {
        const g = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "g"
        );
        g.setAttribute("opacity", "0.5");

        const circle = generate_circle(pos_to_coord(line[0]));
        circle.setAttribute("r", "0.22");
        circle.setAttribute("fill", "rgb(30, 194, 112)");
        g.appendChild(circle);

        const poly = generate_polyline(line.map(pos_to_coord));
        poly.setAttribute("stroke", "rgb(30, 194, 112)");
        poly.setAttribute("stroke-width", "0.18");
        poly.setAttribute("stroke-linejoin", "round");
        poly.setAttribute("stroke-linecap", "round");
        g.appendChild(poly);

        ctx.layer_bottom.appendChild(g);
    }
}

const prism_render: Renderer<PrismRule> = function (ctx: RenderContext, rule: PrismRule) {
    for (const [r1, c1, r2, c2, type] of rule.render_state.edges) {
        const cx = (c1 + c2 + 1) / 2, cy = (r1 + r2 + 1) / 2;
        const d = 0.18, r3 = 3 ** 0.5, dx = d / 2 * r3, dy = d / 2;
        const points: Coordinate[] = [
            [cx, cy - d],
            [cx + dx, cy - dy],
            [cx + dx, cy + dy],
            [cx, cy + d],
            [cx - dx, cy + dy],
            [cx - dx, cy - dy],
        ];

        const poly = generate_polygon(points);
        poly.setAttribute("fill", type ? "rgba(255, 0, 0, 0.8)" : "rgba(0, 0, 255, 0.8)");
        poly.setAttribute("stroke", "white");
        poly.setAttribute("stroke-width", "0.01");

        ctx.layer_top.appendChild(poly);
    }
}

const triangle_rotation = (x: number, y: number, r3: number = 3 ** 0.5): [number, number][] => [
    [-x / 2 - y * r3 / 2, x * r3 / 2 - y / 2],
    [x, y],
    [-x / 2 + y * r3 / 2, -x * r3 / 2 - y / 2],
]

const point_render: Renderer<PointRule> = function (ctx: RenderContext, rule: PointRule) {
    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const cx = (c1 + c2 + 1) / 2, cy = (r1 + r2 + 1) / 2;
        const d = 0.12;

        const points = triangle_rotation((c2 - c1) * d, (r2 - r1) * d)
            .map(([x, y]): [number, number] => [x + cx, y + cy]);

        const poly = generate_polygon(points);
        poly.setAttribute("fill", "black");
        poly.setAttribute("stroke", "white");
        poly.setAttribute("stroke-width", "0.025");

        ctx.layer_top.appendChild(poly);
    }
}

const reference_render: Renderer<ReferenceRule> = function (ctx: RenderContext, rule: ReferenceRule) {
    for (const [direction, index] of rule.render_state.lines) {
        let line: SVGLineElement;

        switch (direction as Direction) {
            case "ROW":
                line = generate_line([0, index + 0.5], [9, index + 0.5]);
                break;
            case "COL":
                line = generate_line([index + 0.5, 0], [index + 0.5, 9]);
                break;
        }

        line.setAttribute("stroke", "rgba(255, 0, 0, 0.3)");
        line.setAttribute("stroke-width", "0.25");

        ctx.layer_bottom.appendChild(line);
    }
}

const root_render: Renderer<RootRule> = function (ctx: RenderContext, rule: RootRule) {
    for (const [r, c, dist] of rule.render_state.cells) {
        const text = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "text"
        );

        text.setAttribute("x", `${c + 0.5}`);
        text.setAttribute("y", `${r + 0.55}`);
        let mx = 0;
        for (let i = 1; i ** 2 <= dist; i++) {
            if (dist % i ** 2 === 0) mx = i;
        }
        let txt = '';
        if (mx !== 1) txt += mx;
        if (mx ** 2 !== dist) txt += `√${Math.floor(dist / mx ** 2)}`;
        if (dist === 1) txt = '1';
        text.textContent = txt;

        text.setAttribute("text-anchor", "middle");
        text.setAttribute("dominant-baseline", "middle");
        text.setAttribute("font-size", "0.35");
        text.setAttribute("font-weight", "bold")
        text.setAttribute("font-family", "Cambria Math, serif");
        text.setAttribute("fill", "rgba(127, 127, 127, 0.5)");
        text.style.userSelect = "none";
        text.style.pointerEvents = "none";

        ctx.layer_bottom.appendChild(text);
    }
}

const temperature_render: Renderer<TemperatureRule> = function (ctx: RenderContext, rule: TemperatureRule) {
    for (const {cells: [[r1, c1], [r2, c2], [r3, c3]], color} of rule.render_state.regions) {
        const points: [number, number][] = [
            [c1 + 0.5 + (c1 - c2) * 0.3, r1 + 0.5 + (r1 - r2) * 0.3],
            [c2 + 0.5, r2 + 0.5],
            [c3 + 0.5 + (c3 - c2) * 0.3, r3 + 0.5 + (r3 - r2) * 0.3],
        ];
        const new_color = {
            "red": "rgba(255, 0, 0, 0.4)",
            "green": "rgba(0, 255, 0, 0.4)",
            "blue": "rgba(0, 0, 255, 0.4)",
        }[color];

        const poly = generate_polyline(points);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", new_color);
        poly.setAttribute("stroke-width", "0.6");

        ctx.layer_bottom.appendChild(poly);
    }
}

const vector_render: Renderer<VectorRule, [string?]> = function (
    ctx: RenderContext, rule: VectorRule, color: string = "rgba(255, 0, 106, 0.5)"
) {
    const d = 0.25;
    const direction_map: Record<"L" | "R" | "U" | "D", [number, number]> = {
        "L": [-d, 0],
        "R": [d, 0],
        "U": [0, -d],
        "D": [0, d],
    };

    for (const [r, c, direction] of rule.render_state.arrows) {
        const [x, y] = direction_map[direction];
        const points = triangle_rotation(x, y)
            .map(([nx, ny]): [number, number] => [nx + c + 0.5 - 0.2 * x, ny + r + 0.5 - 0.2 * y]);

        const poly = generate_polygon(points)
        poly.setAttribute("fill", color);
        ctx.layer_bottom.appendChild(poly);
    }
}

const pair_render: Renderer<PairRule> = function (ctx: RenderContext, rule: PairRule) {
    for (const region of rule.render_state.dominoes) {
        const path = generate_cage(region, 0.1);
        path.setAttribute("fill", "rgba(151, 104, 255, 0.2)");
        path.setAttribute("stroke", "rgba(151, 104, 255, 0.8)");
        path.setAttribute("stroke-width", "0.02");
        path.setAttribute("stroke-dasharray", "0.12 0.08");
        path.setAttribute("stroke-dashoffset", "0.06");
        ctx.layer_bottom.appendChild(path);
    }
}

const trail_render: Renderer<TrailRule> = function (ctx: RenderContext, rule: TrailRule) {
    for (const [pos, color] of [
        [rule.render_state.start, "rgb(0, 127, 255)"],
        [rule.render_state.end, "rgb(255, 127, 0)"]
    ] as [Position, string][]) {
        const circle = generate_circle(pos_to_coord(pos));
        circle.setAttribute("r", "0.33");
        circle.setAttribute("stroke", color);
        circle.setAttribute("stroke-width", "0.04");
        circle.setAttribute("fill", color);
        circle.setAttribute("fill-opacity", "0.4");
        ctx.layer_bottom.appendChild(circle);
    }
}

const bridge_render: Renderer<BridgeRule> = function (ctx: RenderContext, rule: BridgeRule) {
    const d = 0.15;
    const len = rule.render_state.start_rows.length;
    for (const [i, row] of rule.render_state.start_rows.entries()) {
        const cx = 0, cy = row + 0.5;
        const points: Coordinate[] = [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]];
        const poly = generate_polygon(points);
        poly.setAttribute("fill", `hsl(${360 / len * i}, 100%, 34.0%)`);

        const line = generate_line([0, row - 0.03], [0, row + 1.03]);
        line.setAttribute("stroke", `hsl(${360 / len * i}, 100%, 43.1%)`);
        line.setAttribute("stroke-width", "0.1");

        ctx.layer_top.appendChild(line);
        ctx.layer_top.appendChild(poly);
    }
}

const reflex_render: Renderer<ReflexRule> = function (ctx: RenderContext, rule: ReflexRule) {
    for (const [r, c] of rule.render_state.marked_cells) {
        const points = [[c, r], [c + 1, r], [c + 1, r + 1], [c, r + 1]] as [number, number][];
        const polygon = generate_polygon(points);
        polygon.setAttribute("fill", "rgba(255, 255, 127, 0.3)");

        const circle = generate_circle(pos_to_coord([r, c]));
        circle.setAttribute("r", "0.32");
        circle.setAttribute("fill", "none");
        circle.setAttribute("stroke", "rgba(255, 220, 63, 0.6)");
        circle.setAttribute("stroke-width", "0.04");

        ctx.layer_bottom.appendChild(polygon);
        ctx.layer_bottom.appendChild(circle);
    }
}

const aquarium_render: Renderer<AquariumRule> = function (ctx: RenderContext, rule: AquariumRule) {
    const length = rule.render_state.regions.length;
    for (const [i, region] of rule.render_state.regions.entries()) {
        const path = generate_cage(region, 0.1);
        const color = `hsl(${160 + 40 / length * i}, 80%, 50%)`
        path.setAttribute("fill",  color);
        path.setAttribute("fill-opacity", "0.3");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-width", "0.04");
        path.setAttribute("stroke-dasharray", "0.12 0.08");
        path.setAttribute("stroke-dashoffset", "0.06");
        ctx.layer_bottom.appendChild(path);
    }
}

const meta_render: Renderer<MetaRule> = function (ctx: RenderContext, rule: MetaRule) {
    const d = 0.2;
    for (const pos of rule.render_state.diamond_cells) {
        const [cx, cy] = pos_to_coord(pos);
        const points: Coordinate[] = [[cx, cy - d], [cx + d, cy], [cx, cy + d], [cx - d, cy]];
        const poly = generate_polygon(points);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "rgba(0, 0, 200, 0.5)");
        poly.setAttribute("stroke-width", "0.02");

        ctx.layer_bottom.appendChild(poly);
    }
}

const link_prime_render: Renderer<LinkPrimeRule> = function (ctx: RenderContext, rule: LinkPrimeRule) {
    const link_rule: LinkRule = {
        id: "[LK]",
        render_state: rule.render_state,
    }

    link_render(ctx, link_rule);
}

const prism_prime_render: Renderer<PrismPrimeRule> = function (ctx: RenderContext, rule: PrismPrimeRule) {
    const prism_rule: PrismRule = {
        id: "[PR]",
        render_state: { edges: [] },
    };

    for (const [r1, c1, r2, c2, r3, c3, type] of rule.render_state.triplets) {
        prism_rule.render_state.edges.push([r1, c1, r2, c2, type]);
        prism_rule.render_state.edges.push([r2, c2, r3, c3, type]);
    }

    prism_render(ctx, prism_rule);
}

const lotus_prime_render: Renderer<LotusPrimeRule> = function (ctx: RenderContext, rule: LotusPrimeRule) {
    const lotus_rule: LotusRule = {
        id: "[LO]",
        render_state: rule.render_state,
    };

    lotus_render(ctx, lotus_rule, "rgb(40,200,222)");
}

const root_prime_render: Renderer<RootPrimeRule> = function (ctx: RenderContext, rule: RootPrimeRule) {
    const root_rule: RootRule = {
        id: "[RT]",
        render_state: rule.render_state,
    };

    root_render(ctx, root_rule);
}

const trail_prime_render: Renderer<TrailPrimeRule> = function (ctx: RenderContext, rule: TrailPrimeRule) {
    const trail_rule: TrailRule = {
        id: "[TR]",
        render_state: rule.render_state,
    };

    trail_render(ctx, trail_rule);
}

const segment_prime_render: Renderer<SegmentPrimeRule> = function (ctx: RenderContext, rule: SegmentPrimeRule) {
    const length = rule.render_state.regions.length;
    for (const [i, region] of rule.render_state.regions.entries()) {
        const path = generate_cage(region, 0.2);
        const color = `hsl(${310 / length * i}, 50%, 50%)`;
        path.setAttribute("fill", color);
        path.setAttribute("fill-opacity", "0.3");
        path.setAttribute("stroke", color);
        path.setAttribute("stroke-opacity", "0.7");
        path.setAttribute("stroke-width", "0.05");
        ctx.layer_bottom.appendChild(path);
    }
}

const vector_prime_render: Renderer<VectorPrimeRule> = function (ctx: RenderContext, rule: VectorPrimeRule) {
    const vector_rule: VectorRule = {
        id: "[VT]",
        render_state: rule.render_state,
    };

    vector_render(ctx, vector_rule, "rgba(85, 51, 255, 0.5)");
}

function generate_get_pos(direction: DirectionExtended, index: number): (n: number, b?: number) => [number, number] {
    switch (direction) {
        case "ROW_LEFT":
            return (n: number, b: number = 0) => [-(n / 4) - 0.25, index + b + 0.5];
        case "ROW":
            return (n: number, b: number = 0) => [(n / 4) + 9.25, index + b + 0.5];
        case "COL_TOP":
            return (n: number, b: number = 0) => [index + b + 0.5, -(n / 2.8) - 0.25];
        case "COL":
            return (n: number, b: number = 0) => [index + b + 0.5, (n / 2.8) + 9.25];
    }
}

function side_render(ctx: RenderContext, rule: SideRule, color: string) {
    for (let [direction, index, cells] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);

        const arr: Array<string | number> = Array.isArray(cells) ? cells : [cells];

        for (const b of [-0.5, 0.5]) {
            const [x1, y1] = get_pos(-0.5, b);
            const [x2, y2] = get_pos(arr.length - 0.5, b);
            const line = generate_line([x1, y1], [x2, y2]);

            line.setAttribute("stroke", "#aaa");
            line.setAttribute("stroke-width", "0.05");

            ctx.layer_middle.appendChild(line);
        }

        for (const [i, value] of arr.entries()) {
            const text = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text"
            );

            const t = value.toString();
            let x = 0, y = 0;
            if (direction === "ROW_LEFT" || direction === "ROW") {
                [x, y] = get_pos(i + (t.length - 1) / 3);
            } else {
                [x, y] = get_pos(i);
            }

            text.textContent = t;
            text.setAttribute("x", x.toString());
            text.setAttribute("y", y.toString());
            text.setAttribute("text-anchor", "middle");
            text.setAttribute("dominant-baseline", "middle");
            text.setAttribute("font-size", "0.3");
            text.setAttribute("font-weight", "bold")
            text.setAttribute("fill", color);
            text.style.userSelect = "none";
            text.style.pointerEvents = "none";

            ctx.layer_middle.appendChild(text);
        }
    }
}

const sequence_render: Renderer<SequenceRule> = (ctx: RenderContext, rule: SequenceRule) =>
    side_render(ctx, rule, "red");

const quantum_render: Renderer<QuantumRule> = (ctx: RenderContext, rule: QuantumRule) =>
    side_render(ctx, rule, "green");

const range_render: Renderer<RangeRule> = (ctx: RenderContext, rule: RangeRule) =>
    side_render(ctx, rule, "blue");

const product_render: Renderer<ProductRule> = (ctx: RenderContext, rule: ProductRule) =>
    side_render(ctx, rule, "rgb(127, 52, 0)");

const sequence_prime_render: Renderer<SequencePrimeRule> = (ctx: RenderContext, rule: SequencePrimeRule) =>
    side_render(ctx, rule, "red");

const range_prime_render: Renderer<RangePrimeRule> = (ctx: RenderContext, rule: RangePrimeRule) =>
    side_render(ctx, rule, "blue");

const renderers: Record<RuleID, (ctx: RenderContext, r: Rule) => void> = {
    "[Sudoku]": sudoku_render,
    "[R]": row_render,
    "[R']": row_prime_render,
    "[C]": column_render,
    "[B]": box_render,
    "[DT]": nothing_render,
    "[QD]": nothing_render,
    "[ES]": nothing_render,
    "[TP]": nothing_render,
    "[EP]": nothing_render,
    "[BP]": nothing_render,
    "[QD']": nothing_render,
    "[BL]": nothing_render,
    "[SG]": (ctx, r) => segment_render(ctx, r as SegmentRule),
    "[LK]": (ctx, r) => link_render(ctx, r as LinkRule),
    "[LO]": (ctx, r) => lotus_render(ctx, r as LotusRule),
    "[MR]": (ctx, r) => metro_render(ctx, r as MetroRule),
    "[PR]": (ctx, r) => prism_render(ctx, r as PrismRule),
    "[PO]": (ctx, r) => point_render(ctx, r as PointRule),
    "[RF]": (ctx, r) => reference_render(ctx, r as ReferenceRule),
    "[RT]": (ctx, r) => root_render(ctx, r as RootRule),
    "[TM]": (ctx, r) => temperature_render(ctx, r as TemperatureRule),
    "[SQ]": (ctx, r) => sequence_render(ctx, r as SequenceRule),
    "[QT]": (ctx, r) => quantum_render(ctx, r as QuantumRule),
    "[RG]": (ctx, r) => range_render(ctx, r as RangeRule),
    "[VT]": (ctx, r) => vector_render(ctx, r as VectorRule),
    "[SR]": (ctx, r) => stream_render(ctx, r as StreamRule),
    "[PA]": (ctx, r) => pair_render(ctx, r as PairRule),
    "[IV]": (ctx, r) => inversion_render(ctx, r as InversionRule),
    "[TR]": (ctx, r) => trail_render(ctx, r as TrailRule),
    "[PD]": (ctx, r) => product_render(ctx, r as ProductRule),
    "[BD]": (ctx, r) => bridge_render(ctx, r as BridgeRule),
    "[EF]": (ctx, r) => reflex_render(ctx, r as ReflexRule),
    "[AQ]": (ctx, r) => aquarium_render(ctx, r as AquariumRule),
    "[MT]": (ctx, r) => meta_render(ctx, r as MetaRule),
    "[B']": (ctx, r) => box_prime_render(ctx, r as BoxPrimeRule),
    "[LK']": (ctx, r) => link_prime_render(ctx, r as LinkPrimeRule),
    "[PR']": (ctx, r) => prism_prime_render(ctx, r as PrismPrimeRule),
    "[LO']": (ctx, r) => lotus_prime_render(ctx, r as LotusPrimeRule),
    "[RT']": (ctx, r) => root_prime_render(ctx, r as RootPrimeRule),
    "[SQ']": (ctx, r) => sequence_prime_render(ctx, r as SequencePrimeRule),
    "[RG']": (ctx, r) => range_prime_render(ctx, r as RangePrimeRule),
    "[TR']": (ctx, r) => trail_prime_render(ctx, r as TrailPrimeRule),
    "[SG']": (ctx, r) => segment_prime_render(ctx, r as SegmentPrimeRule),
    "[VT']": (ctx, r) => vector_prime_render(ctx, r as VectorPrimeRule),
    "[ST]": nothing_render,  // TODO
};

const render_order: Array<RuleID> = [
    "[RT]", "[RT']",  // bottom - background
    "[TM]", "[AQ]", "[PA]", "[SG']",  // bottom - cage
    "[LO]", "[LO']", "[TR]", "[TR']", "[EF]",  // bottom - circle
    "[VT]", "[VT']", "[MT]",  // bottom - shape
    "[SR]", "[RF]", "[IV]", "[MR]",  // bottom - line

    "[Sudoku]", "[R]", "[R']", "[C]", "[B]", "[B']", "[SG]",  // middle

    "[BD]", "[PR]", "[PR']", "[LK]", "[LK']", "[PO]"  // top
] as const;

const render_order_key: Partial<Record<RuleID, number>> = Object.fromEntries(render_order.map((value, index) => [value, index]));

const get_key = (rule: Rule) => render_order_key[rule.id] ?? -1;

export function render_all(rules: Rule[]) {
    const ctx: RenderContext = {
        layer_bottom: document.querySelector<SVGSVGElement>("#layer-bottom")!,
        layer_middle: document.querySelector<SVGSVGElement>("#layer-middle")!,
        layer_top: document.querySelector<SVGSVGElement>("#layer-top")!
    };

    const sorted_rules = [...rules].sort((a, b) => get_key(a) - get_key(b));

    for (const rule of sorted_rules) {
        const id = rule.id;
        const renderer = renderers[id];
        if (!renderer) continue;
        renderer(ctx, rule);
    }
}
