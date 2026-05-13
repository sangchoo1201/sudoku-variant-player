import "./style.css"

const app = document.getElementById("app")!;
const board = document.getElementById("board")!;
const controls = document.getElementById("controls")!;

const resize = () => {
    const width = app.clientWidth, height = app.clientHeight;
    let board_size = 0;
    let controls_width = 0, controls_height = 0;
    if (window.matchMedia("(orientation: landscape)").matches) {
        board_size = Math.min(width * 2 / 3, height);

        const ratio = 1 / 2;
        controls_width = Math.min(width / 3, height * ratio);
        controls_height = controls_width / ratio;
    }
    if (window.matchMedia("(orientation: portrait)").matches) {
        board_size = Math.min(width, height * 0.65);

        const remaining_height = height - board_size;
        const ratio = 1.4;
        controls_width = Math.min(width, remaining_height * ratio);
        controls_height = controls_width / ratio;
    }
    board.style.width = `${board_size}px`;
    board.style.height = `${board_size}px`;
    controls.style.width = `${controls_width}px`;
    controls.style.height = `${controls_height}px`;
}

const observer = new ResizeObserver(resize);
observer.observe(app);
resize();
