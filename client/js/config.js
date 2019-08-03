const TRANSLATIONS_EN_RU = {
    asphalt: "асфальт",
    cobblestone: "булыжник",
    compacted: "уплотнённый грунт",
    concrete: "бетон",
    fine_gravel: "мелкий гравий",
    granite: "гранит",
    gravel: "гравий",
    ground: "грунт",
    paved: "мощённая дорожка",
    paving_stones: "плитка",
    sett: "брусчатка",
    tartan: "беговая дорожка",
    unpaved: "не мощённая дорожка",
    wood: "деревянная дорожка",

    excellent: "очень ровная",
    good: "ровная",
    intermediate: "довольно ровная",
    bad: "неровная",

    green: "легко",
    blue: "средне",
    red: "сложно",
    black: "очень сложно",
    unknown: "неизвестно",

    moscow: "Москва",
    saint_petersburg: "Санкт-Петербург",
    saratov: "Саратов",
    tyumen: "Тюмень",
};

const G_GREEN = "green";
const G_BLUE = "blue";
const G_RED = "red";
const G_BLACK = "black";
const G_UNKNOWN = "unknown";

const GRADE_COLORS = [G_GREEN, G_BLUE, G_RED, G_BLACK, G_UNKNOWN];

const GRADE_BY_SMOOTHNESS = {
    excellent: G_GREEN,
    good: G_BLUE,
    intermediate: G_RED,
    bad: G_BLACK,
};

const GRADE_BY_SURFACE = {
    asphalt: G_GREEN,
    cobblestone: G_BLACK,
    compacted: G_BLACK,
    concrete: G_BLUE,
    fine_gravel: G_BLACK,
    granite: G_BLUE,
    gravel: G_BLACK,
    ground: G_BLACK,
    paved: G_UNKNOWN,
    paving_stones: G_RED,
    sett: G_BLACK,
    tartan: G_RED,
    unpaved: G_BLACK,
    wood: G_RED
};

const CONFIG_BASE_LAYER = "OSM";
const CONFIG_MIN_ZOOM = 13;
const CONFIG_MAX_ZOOM = 19;
const CONFIG_DEFAULT_ZOOM = 17;

const POIs = {
    moscow: [55.743, 37.610],
    saint_petersburg: [59.970860, 30.268775],
    saratov: [51.524958, 46.041146],
    tyumen: [57.151052, 65.537769],
};

const CITIES = [
    "moscow",
    "saint_petersburg",
    "saratov",
    "tyumen",
];
