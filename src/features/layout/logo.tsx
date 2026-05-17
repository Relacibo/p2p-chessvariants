import { Box, Group, Image, MantineSize, UnstyledButton, Text } from "@mantine/core";
import { Link } from "react-router-dom";

type LogoProps = {
  imageSize?: string | number;
  textSize?: MantineSize;
};

function Logo({ imageSize, textSize }: LogoProps) {
  return (
    <UnstyledButton component={Link} to="/">
      <Group>
        <Box w={imageSize}>
          <Image radius="md" src="/logo192.png" alt="gg"></Image>
        </Box>
        <Text size={textSize}>ggchess.org</Text>
      </Group>
    </UnstyledButton>
  );
}

export default Logo;
