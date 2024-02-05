import { Box, Group, Image, MantineSize, Text } from "@mantine/core";

type LogoProps = {
  imageSize?: string | number;
  textSize?: MantineSize;
};

function Logo({ imageSize, textSize }: LogoProps) {
  return (
    <Group>
      <Box w={imageSize}>
        <Image radius="md" src="/logo192.png" alt="gg"></Image>
      </Box>
      <Text size={textSize}>ggchess.org</Text>
    </Group>
  );
}

export default Logo;
