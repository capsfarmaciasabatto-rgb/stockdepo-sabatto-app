import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function TestFirebase() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchPedidos() {
      try {
        const querySnapshot = await getDocs(collection(db, 'pedidos_test'));
        const data = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setPedidos(data);
      } catch (error) {
        console.error('Error:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchPedidos();
  }, []);

  if (loading) return <div>Cargando...</div>;

  return (
    <div>
      <h2>Pedidos de prueba desde Firebase</h2>
      {pedidos.length === 0 ? (
        <p>No hay pedidos</p>
      ) : (
        <ul>
          {pedidos.map(pedido => (
            <li key={pedido.id}>
              {pedido.nombre} - {pedido.fecha?.toDate?.().toLocaleString() || 'Sin fecha'}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
