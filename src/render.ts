import type {
    LinkRule,
    LotusRule,
    MetroRule,
    PrismRule, QuantumRule, RangeRule,
    ReferenceRule,
    RootRule,
    Rule,
    RuleID, SequenceRule, SideRule, TemperatureRule
} from "./schema.ts";

type RenderContext = {
    layer_bottom: SVGSVGElement,
    layer_middle: SVGSVGElement,
    layer_top: SVGSVGElement,
}

type PureRenderer = (ctx: RenderContext) => void;
type Renderer<T> = (ctx: RenderContext, rule: T) => void;

const sudoku_render: PureRenderer = function (ctx: RenderContext) {
    for (let i = 0; i < 20; i++) {
        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        const [x1, x2, y1, y2] = (i >= 10 ? [0.025, 9, i % 10, i % 10] : [i % 10, i % 10, 0.025, 9]).map(String);

        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);

        line.setAttribute("stroke", "#aaa");
        line.setAttribute("stroke-width", "0.01");
        line.setAttribute("stroke-dasharray", "0.15 0.05");

        ctx.layer_middle.appendChild(line);
    }
}

const row_render: PureRenderer = function (ctx: RenderContext) {
    for (let i = 0; i <= 9; i++) {
        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        line.setAttribute("x1", "0");
        line.setAttribute("y1", i.toString());
        line.setAttribute("x2", "9");
        line.setAttribute("y2", i.toString());

        line.setAttribute("stroke", "#777");
        line.setAttribute("stroke-width", "0.035");

        ctx.layer_middle.appendChild(line);
    }
}

const column_render: PureRenderer = function (ctx: RenderContext) {
    for (let i = 0; i <= 9; i++) {
        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        line.setAttribute("x1", i.toString());
        line.setAttribute("y1", "0");
        line.setAttribute("x2", i.toString());
        line.setAttribute("y2", "9");

        line.setAttribute("stroke", "#777");
        line.setAttribute("stroke-width", "0.035");

        ctx.layer_middle.appendChild(line);
    }
}

const box_render: PureRenderer = function (ctx: RenderContext) {
    for (let i = 0; i < 8; i++) {
        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        const i3 = (i % 4) * 3;
        const [x1, x2, y1, y2] = (i >= 4 ? [-0.03, 9.03, i3, i3] : [i3, i3, -0.03, 9.03]).map(String);

        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);

        line.setAttribute("stroke", "black");
        line.setAttribute("stroke-width", "0.06");

        ctx.layer_middle.appendChild(line);
    }
}

const link_render: Renderer<LinkRule> = function (ctx: RenderContext, rule: LinkRule) {
    for (const [[r1, c1], [r2, c2]] of rule.render_state.edges) {
        const poly = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
        );

        const cx = (c1 + c2 + 1) / 2, cy = (r1 + r2 + 1) / 2;
        const d = 0.12;
        poly.setAttribute("points", `${cx},${cy - d} ${cx + d},${cy} ${cx},${cy + d} ${cx - d},${cy}`);
        poly.setAttribute("fill", "white");
        poly.setAttribute("stroke", "black");
        poly.setAttribute("stroke-width", "0.03");

        ctx.layer_top.appendChild(poly);
    }
}

const lotus_render: Renderer<LotusRule> = function (ctx: RenderContext, rule: LotusRule) {
    for (const [r, c] of rule.render_state.cells) {
        const circle = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "circle"
        );

        circle.setAttribute("cx", (c + 0.5).toString());
        circle.setAttribute("cy", (r + 0.5).toString());
        circle.setAttribute("r", "0.3");

        circle.setAttribute("fill", "rgba(189, 235, 107, 0.5)");
        circle.setAttribute("stroke", "rgba(189, 235, 107, 1)");
        circle.setAttribute("stroke-width", "0.05");

        ctx.layer_bottom.appendChild(circle);
    }
}

const metro_render: Renderer<MetroRule> = function (ctx: RenderContext, rule: MetroRule) {
    const length = rule.render_state.metros.length;
    for (const [i, metro] of rule.render_state.metros.entries()) {
        const points: string[] = [];
        for (const [r, c] of metro) {
            points.push(`${c + 0.5},${r + 0.5}`);
        }

        const poly = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polyline"
        );

        poly.setAttribute("points", points.join(' '));
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", `hsla(${360 / length * i}, 80%, 50%, 0.4)`);
        poly.setAttribute("stroke-width", "0.1");
        poly.setAttribute("stroke-linejoin", "round");
        poly.setAttribute("stroke-linecap", "round");

        ctx.layer_bottom.appendChild(poly);
    }
}

const prism_render: Renderer<PrismRule> = function (ctx: RenderContext, rule: PrismRule) {
    for (const [r1, c1, r2, c2, type] of rule.render_state.edges) {
        const cx = (c1 + c2 + 1) / 2, cy = (r1 + r2 + 1) / 2;
        const d = 0.15, r3 = 3 ** 0.5, dx = d / 2 * r3, dy = d / 2;
        const points = [
            `${cx},${cy - d}`,
            `${cx + dx},${cy - dy}`,
            `${cx + dx},${cy + dy}`,
            `${cx},${cy + d}`,
            `${cx - dx},${cy + dy}`,
            `${cx - dx},${cy - dy}`,
        ];

        const poly = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polygon"
        );

        poly.setAttribute("points", points.join(' '));
        poly.setAttribute("fill", type ? "rgba(255, 0, 0, 0.8)" : "rgba(0, 0, 255, 0.8)");
        poly.setAttribute("stroke", "white");
        poly.setAttribute("stroke-width", "0.01");

        ctx.layer_top.appendChild(poly);
    }
}

const reference_render: Renderer<ReferenceRule> = function (ctx: RenderContext, rule: ReferenceRule) {
    for (const [direction, index] of rule.render_state.lines) {
        const line = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "line"
        );

        if (direction === "ROW") {
            line.setAttribute("x1", "0");
            line.setAttribute("y1", `${index + 0.5}`);
            line.setAttribute("x2", "9");
            line.setAttribute("y2", `${index + 0.5}`);
        }
        if (direction === "COL") {
            line.setAttribute("x1", `${index + 0.5}`);
            line.setAttribute("y1", "0");
            line.setAttribute("x2", `${index + 0.5}`);
            line.setAttribute("y2", "9");
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
        let txt = ''
        if (mx !== 1) txt += mx;
        if (mx ** 2 !== dist) txt += `√${Math.floor(dist / mx ** 2)}`;
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
        const poly = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "polyline"
        );

        const points = [
            `${c1 + 0.5 + (c1 - c2) * 0.3},${r1 + 0.5 + (r1 - r2) * 0.3}`,
            `${c2 + 0.5},${r2 + 0.5}`,
            `${c3 + 0.5 + (c3 - c2) * 0.3},${r3 + 0.5 + (r3 - r2) * 0.3}`,
        ];
        const new_color = {
            "red": "rgba(255, 0, 0, 0.4)",
            "green": "rgba(0, 255, 0, 0.4)",
            "blue": "rgba(0, 0, 255, 0.4)",
        }[color];

        poly.setAttribute("points", points.join(' '));
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", new_color);
        poly.setAttribute("stroke-width", "0.6");

        ctx.layer_bottom.appendChild(poly);
    }
}

function generate_get_pos(direction: "ROW" | "COL", index: number): (n: number, b?: number) => [number, number] {
    switch (direction) {
        case "ROW":
            return (n: number, b: number = 0) => [(n / 4) + 9.25, index + b + 0.5];
        case "COL":
            return (n: number, b: number = 0) => [index + b + 0.5, (n / 2.8) + 9.25];
    }
}

function side_render(ctx: RenderContext, rule: SideRule, color: string) {
    for (const [direction, index, cells] of rule.render_state.side_hints) {
        const get_pos = generate_get_pos(direction, index);

        for (const b of [-0.5, 0.5]) {
            const line = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "line"
            );

            const [x1, y1] = get_pos(-0.5, b);
            const [x2, y2] = get_pos(cells.length - 0.5, b);

            line.setAttribute("x1", x1.toString());
            line.setAttribute("y1", y1.toString());
            line.setAttribute("x2", x2.toString());
            line.setAttribute("y2", y2.toString());

            line.setAttribute("stroke", "#aaa");
            line.setAttribute("stroke-width", "0.05");

            ctx.layer_middle.appendChild(line);
        }

        for (const [i, value] of cells.entries()) {
            const text = document.createElementNS(
                "http://www.w3.org/2000/svg",
                "text"
            );

            const [x, y] = get_pos(i);

            text.textContent = value.toString();

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

const renderers: Partial<Record<RuleID, (ctx: RenderContext, r: Rule) => void>> = {
    "[Sudoku]": sudoku_render,
    "[R]": row_render,
    "[C]": column_render,
    "[B]": box_render,
    "[LK]": (ctx, r) => link_render(ctx, r as LinkRule),
    "[LO]": (ctx, r) => lotus_render(ctx, r as LotusRule),
    "[MR]": (ctx, r) => metro_render(ctx, r as MetroRule),
    "[PR]": (ctx, r) => prism_render(ctx, r as PrismRule),
    "[RF]": (ctx, r) => reference_render(ctx, r as ReferenceRule),
    "[RT]": (ctx, r) => root_render(ctx, r as RootRule),
    "[TM]": (ctx, r) => temperature_render(ctx, r as TemperatureRule),
    "[SQ]": (ctx, r) => sequence_render(ctx, r as SequenceRule),
    "[QT]": (ctx, r) => quantum_render(ctx, r as QuantumRule),
    "[RG]": (ctx, r) => range_render(ctx, r as RangeRule),
};

export function render_all(rules: Rule[]) {
    const ctx: RenderContext = {
        layer_bottom: document.querySelector<SVGSVGElement>("#layer-bottom")!,
        layer_middle: document.querySelector<SVGSVGElement>("#layer-middle")!,
        layer_top: document.querySelector<SVGSVGElement>("#layer-top")!,
    };

    for (const rule of rules) {
        const id = rule.id;
        const renderer = renderers[id];
        if (!renderer) continue;
        renderer(ctx, rule);
    }
}
