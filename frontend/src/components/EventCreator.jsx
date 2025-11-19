import { useState } from "react";
import { adminAPI } from "../api/adminApi";
import { Card, Button, TextInput } from "@mantine/core";

export default function EventCreator({ onCreated }) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");

  async function create() {
    if (!title || !date) return alert("Faltan campos");

    await adminAPI.createEvent({ title, date });
    setTitle("");
    setDate("");

    onCreated();
  }

  return (
    <Card p="lg" shadow="sm" mt="md">
      <h3>Crear nuevo evento</h3>
      <TextInput mt="sm" label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />
      <TextInput mt="sm" label="Fecha (YYYY-MM-DD)" value={date} onChange={(e) => setDate(e.target.value)} />

      <Button mt="md" onClick={create}>Crear evento</Button>
    </Card>
  );
}
