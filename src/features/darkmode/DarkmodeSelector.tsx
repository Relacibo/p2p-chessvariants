import { Switch, useMantineColorScheme } from "@mantine/core";

function DarkmodeSelector() {
  const { colorScheme, setColorScheme } = useMantineColorScheme();
  const dark = colorScheme === "dark";
  return (
    <Switch
      checked={dark}
      label="Dark mode"
      onChange={({ currentTarget: { checked } }) => {
        setColorScheme(checked ? "dark" : "light");
      }}
    />
  );
}

export default DarkmodeSelector;
