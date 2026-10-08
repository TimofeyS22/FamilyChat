export type AvatarOption = {
  id: string;
  label: string;
  src: string;
};

export const avatarOptions = [
  { id: "mama", label: "Мама", src: "/avatars/mama.png" },
  { id: "papa", label: "Папа", src: "/avatars/papa.png" },
  { id: "doch", label: "Дочь", src: "/avatars/doch.png" },
  { id: "syn", label: "Сын", src: "/avatars/syn.png" },
  { id: "sestra", label: "Сестра", src: "/avatars/sestra.png" },
  { id: "brat", label: "Брат", src: "/avatars/brat.png" },
  { id: "babushka", label: "Бабушка", src: "/avatars/babushka.png" },
  { id: "dedushka", label: "Дедушка", src: "/avatars/dedushka.png" },
] satisfies AvatarOption[];

export function avatarSrcById(id?: string | null) {
  return avatarOptions.find((avatar) => avatar.id === id)?.src ?? null;
}
