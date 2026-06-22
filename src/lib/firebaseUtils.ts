import { db } from '../firebase';
import { collection, addDoc, getDocs, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// Guardar un pedido nuevo
export async function saveOrderToFirebase(order: any) {
  try {
    const docRef = await addDoc(collection(db, 'pedidos'), order);
    console.log('Pedido guardado con ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error guardando pedido:', error);
    throw error;
  }
}

// Obtener todos los pedidos
export async function getOrdersFromFirebase() {
  try {
    const querySnapshot = await getDocs(collection(db, 'pedidos'));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('Error obteniendo pedidos:', error);
    throw error;
  }
}

// Actualizar un pedido
export async function updateOrderInFirebase(orderId: string, updates: any) {
  try {
    const orderRef = doc(db, 'pedidos', orderId);
    await updateDoc(orderRef, updates);
    console.log('Pedido actualizado:', orderId);
  } catch (error) {
    console.error('Error actualizando pedido:', error);
    throw error;
  }
}

// Eliminar un pedido
export async function deleteOrderFromFirebase(orderId: string) {
  try {
    await deleteDoc(doc(db, 'pedidos', orderId));
    console.log('Pedido eliminado:', orderId);
  } catch (error) {
    console.error('Error eliminando pedido:', error);
    throw error;
  }
}
