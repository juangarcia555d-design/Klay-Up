// Controlador para categorías personalizadas
import { getCategories, createCategory, deleteCategory } from '../models/categoryModel.js';

export async function listCategories(req, res) {
  try {
    const userId = req.user && req.user.id;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const cats = await getCategories(userId);
    res.json(cats);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function addCategory(req, res) {
  try {
    const userId = req.user && req.user.id;
    const { name } = req.body;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    const cat = await createCategory(userId, name);
    res.json(cat);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function removeCategory(req, res) {
  try {
    const userId = req.user && req.user.id;
    const { name } = req.body;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    if (!name) return res.status(400).json({ error: 'Nombre requerido' });
    await deleteCategory(userId, name);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}