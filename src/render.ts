import type {
    LinkRule,
    LotusRule,
    MetroRule,
    PrismRule,
    PuzzleData,
    ReferenceRule,
    RootRule,
    Rule,
    RuleID, TemperatureRule
} from "./schema.ts";

const grid = document.getElementById('main-grid')!;
const corner_order = [0, 4, 1, 6, 8, 7, 2, 5, 3] as const;

export type CellType = {
    cell: HTMLDivElement,
    normal: HTMLDivElement,
    corner: HTMLDivElement[],
    center: HTMLDivElement,
}

export function setup_grid(puzzle_data: PuzzleData) {
    const cell_map: CellType[][] = [];
    for (let r = 0; r < 9; r++) {
        cell_map[r] = [];
        for (let c = 0; c < 9; c++) {
            const cell = document.createElement('div');
            cell.classList.add('cell');
            grid.appendChild(cell);

            const normal = document.createElement('div');
            normal.classList.add('normal');
            cell.appendChild(normal);

            const corner = document.createElement('div');
            corner.classList.add('corner');
            cell.appendChild(corner);

            const corner_cells: HTMLDivElement[] = [];
            for (let i = 0; i < 9; i++) {
                const corner_inner = document.createElement('div');
                corner_cells[corner_order[i]] = corner_inner;
                corner.appendChild(corner_inner);
            }

            const center = document.createElement('div');
            center.classList.add('center');
            cell.appendChild(center);

            cell.dataset.row = r.toString();
            cell.dataset.col = c.toString();

            if (r % 3 === 0) cell.classList.add('thick-top');
            if (c % 3 === 0) cell.classList.add('thick-left');
            if (r % 3 === 2) cell.classList.add('thick-bottom');
            if (c % 3 === 2) cell.classList.add('thick-right');

            if (r === 0) cell.classList.add('outside-top');
            if (c === 0) cell.classList.add('outside-left');
            if (r === 8) cell.classList.add('outside-bottom');
            if (c === 8) cell.classList.add('outside-right');

            const value = puzzle_data.board[r][c];
            if (value === 0) {
                normal.textContent = '';
            } else {
                normal.textContent = value.toString();
                cell.classList.add('fixed');
            }

            cell_map[r][c] = {
                cell: cell,
                normal: normal,
                corner: corner_cells,
                center: center,
            };
        }
    }
    return cell_map;
}

type RenderContext = {
    layer_under: SVGSVGElement,
    layer_top: SVGSVGElement,
}

type Renderer<T> = (ctx: RenderContext, rule: T) => void;

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

        ctx.layer_under.appendChild(circle);
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

        ctx.layer_under.appendChild(poly);
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
            "polyline"
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

        ctx.layer_under.appendChild(line);
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

        ctx.layer_under.appendChild(text);
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

        ctx.layer_under.appendChild(poly);
    }
}

const renderers: Partial<Record<RuleID, (ctx: RenderContext, r: Rule) => void>> = {
    "[LK]": (ctx, r) => link_render(ctx, r as LinkRule),
    "[LO]": (ctx, r) => lotus_render(ctx, r as LotusRule),
    "[MR]": (ctx, r) => metro_render(ctx, r as MetroRule),
    "[PR]": (ctx, r) => prism_render(ctx, r as PrismRule),
    "[RF]": (ctx, r) => reference_render(ctx, r as ReferenceRule),
    "[RT]": (ctx, r) => root_render(ctx, r as RootRule),
    "[TM]": (ctx, r) => temperature_render(ctx, r as TemperatureRule),
};

export function render_all(rules: Rule[]) {
    const ctx: RenderContext = {
        layer_under: document.querySelector<SVGSVGElement>("#layer-under")!,
        layer_top: document.querySelector<SVGSVGElement>("#layer-top")!,
    };

    for (const rule of rules) {
        const id = rule.id;
        const renderer = renderers[id];
        if (!renderer) continue;
        renderer(ctx, rule);
    }
}
