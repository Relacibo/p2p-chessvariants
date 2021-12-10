import { ThemeType } from "grommet";

import { grommet } from 'grommet';
import { deepMerge } from "grommet/utils";

const theme: ThemeType = {
    global: {
        font: {
            family: "Source Sans Pro"
        },
        colors: {
            text: {
                dark: "#f8f8f8",
                light: "#150022"
            },
            brand: "#540c7d",
            "neutral-1": {
                dark: "#28033e",
                light: "#c27bec",
            },
            "neutral-2": {
                dark: "#462857",
                light: "#daaaf7",
            },
            "neutral-3": {
                dark: "#634973",
                light: "#f4e0ff",
            },
            "light-1": {
                dark: "#505050",
                light: "#F8F8F8",
            },
            "light-2": {
                dark: "#494949",
                light: "#F2F2F2",
            },
            "light-3": {
                dark: "#404040",
                light: "#EDEDED",
            },
            "light-4": {
                dark: "#393939",
                light: "#333333",
            },
            "light-5": {
                dark: "#393939",
                light: "#DADADA",
            },
            "light-6": {
                dark: "#393939",
                light: "#DADADA",
            },
            "dark-1": {
                dark: "#111111",
                light: "#333333",
            },
            "dark-2": {
                dark: "#191919",
                light: "#444444",
            },
            "dark-3": {
                dark: "#202020",
                light: "#555555",
            },
            "dark-4": {
                dark: "#292929",
                light: "#666666",
            },
            "dark-5": {
                dark: "#292929",
                light: "#666666",
            },
            "dark-6": {
                dark: "#292929",
                light: "#666666",
            },
        },
    },
}
export default deepMerge(grommet, theme);