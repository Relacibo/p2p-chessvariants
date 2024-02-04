import { Group, Image, MantineSize, Text } from "@mantine/core";

type LogoProps = {
  imageSize?: string | number;
  textSize?: MantineSize;
};

function Logo({ imageSize, textSize }: LogoProps) {
  return (
    <Group>
      <Image width={imageSize} radius="md" src="/logo192.png" alt="gg"></Image>
      <Text size={textSize}>ggchess.org</Text>
    </Group>
  );
}

export default Logo;
