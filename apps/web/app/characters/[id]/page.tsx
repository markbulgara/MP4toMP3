import { CharacterSheet } from "@/components/character-sheet";

const CharacterPage = ({ params }: { params: { id: string } }) => {
  return <CharacterSheet id={params.id} />;
};

export default CharacterPage;
