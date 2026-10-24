'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { UserPlus, Edit, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { mensajeError } from '@/lib/errores';

// La escritura de usuarios (hash bcrypt server-side) nunca puede ser offline.
const OFFLINE_WRITE_MSG = 'La gestión de usuarios requiere conexión a internet. Conectate para crear, editar o eliminar usuarios.';

type UsuarioRow = {
  id: number;
  rut: string;
  nombre: string;
  rol: string;
  activo: boolean;
};

export function UsuariosClient({ currentUserId }: { currentUserId: number }) {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal forms
  const [isOpen, setIsOpen] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  
  // Form State
  const [formId, setFormId] = useState<number | null>(null);
  const [rut, setRut] = useState('');
  const [nombre, setNombre] = useState('');
  const [rol, setRol] = useState('vendedor');
  const [password, setPassword] = useState('');
  const [isActive, setIsActive] = useState(true);

  const fetchUsuarios = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/usuarios');
      if (res.ok) {
        const { data } = await res.json();
        setUsuarios(data || []);
      }
    } catch {
      toast.error('Error al cargar usuarios');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsuarios(); }, []);

  const resetForm = () => {
    setFormId(null);
    setRut('');
    setNombre('');
    setRol('vendedor');
    setPassword('');
    setIsActive(true);
    setIsEditMode(false);
  };

  const openCreate = () => {
    resetForm();
    setIsOpen(true);
  };

  const openEdit = (u: UsuarioRow) => {
    resetForm();
    setIsEditMode(true);
    setFormId(u.id);
    setRut(u.rut);
    setNombre(u.nombre);
    setRol(u.rol);
    setIsActive(u.activo);
    setIsOpen(true);
  };

  const handleSave = async () => {
    if (!rut || !nombre) {
      return toast.warning('Faltan campos obligatorios');
    }

    if (!isEditMode && !password) {
      return toast.warning('Debe ingresar una contraseña para el nuevo usuario');
    }

    // Escritura offline bloqueada con mensaje claro (no silencioso, no genérico)
    if (!navigator.onLine) {
      toast.error(OFFLINE_WRITE_MSG);
      return;
    }

    const payload = {
      rut,
      nombre,
      rol,
      empresas: [1],
      ...(password && { password }),
      ...(isEditMode && { activo: isActive }),
    };

    try {
      const url = isEditMode ? `/api/admin/usuarios/${formId}` : '/api/admin/usuarios';
      const method = isEditMode ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
         const { error } = await res.json();
         throw new Error(error || 'Error al guardar');
      }

      toast.success(isEditMode ? 'Usuario actualizado' : 'Usuario creado exitosamente');
      setIsOpen(false);
      fetchUsuarios();
    } catch (err) {
      // Falso positivo de navigator.onLine (dice "hay red local" sin salida a
      // internet): fetch falla con TypeError ante error de red → mismo mensaje.
      if (err instanceof TypeError) {
        toast.error(OFFLINE_WRITE_MSG);
      } else {
        toast.error(mensajeError(err));
      }
    }
  };

  const handleDelete = async (u: UsuarioRow) => {
    if (!confirm(`¿Eliminar permanentemente a ${u.nombre}? Esta acción no se puede deshacer.`)) return;
    // Escritura offline bloqueada con mensaje claro
    if (!navigator.onLine) {
      toast.error(OFFLINE_WRITE_MSG);
      return;
    }
    try {
      const res = await fetch(`/api/admin/usuarios/${u.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error || 'Error al eliminar');
      }
      toast.success('Usuario eliminado');
      fetchUsuarios();
    } catch (err) {
      if (err instanceof TypeError) {
        toast.error(OFFLINE_WRITE_MSG);
      } else {
        toast.error(mensajeError(err));
      }
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full fade-in zoom-in-95 duration-200">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-2">
             <Shield className="w-8 h-8 text-[var(--primary)]" /> Control de Acceso
          </h1>
          <p className="text-[var(--body)] mt-1">Administración de Usuarios y Permisos</p>
        </div>
        <Button onClick={openCreate} className="bg-[var(--primary)] hover:bg-[var(--primary)] text-white shadow-md">
          <UserPlus className="w-5 h-5 mr-2" />
          Crear Usuario
        </Button>
      </div>

      <div className="bg-white bg-[var(--muted)]950 border rounded-card shadow-sm overflow-hidden">
        <Table>
          <TableHeader className="bg-[var(--muted)] border-b">
            <TableRow>
              <TableHead className="w-32 uppercase tracking-wide text-xs">Documento</TableHead>
              <TableHead className="uppercase tracking-wide text-xs">Nombre Completo</TableHead>
              <TableHead className="w-32 uppercase tracking-wide text-xs text-center">Rol</TableHead>
              <TableHead className="w-24 uppercase tracking-wide text-xs text-center">Estado</TableHead>
              <TableHead className="w-20 text-right"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
               <TableRow><TableCell colSpan={5} className="text-center py-12 text-[var(--body)] animate-pulse">Cargando...</TableCell></TableRow>
            ) : usuarios.map(u => (
              <TableRow key={u.id} className={!u.activo ? "opacity-60 bg-[var(--muted)]/50" : ""}>
                 <TableCell className="font-mono text-sm">{u.rut}</TableCell>
                 <TableCell className="font-semibold">{u.nombre}{currentUserId === u.id && ' (Tú)'}</TableCell>
                 <TableCell className="text-center">
                    <Badge variant="outline" className={`\${u.rol === 'admin' ? 'border-[var(--primary)]/30 text-[var(--primary)] bg-[var(--primary)]/10' : u.rol === 'bodeguero' ? 'border-[var(--warning)]/30 text-[var(--warning)] bg-[var(--warning)]/10' : u.rol === 'vendedor' ? 'border-[var(--primary)]/30 text-[var(--primary)] bg-[var(--primary)]/10' : 'bg-transparent'}`}>
                       {u.rol.toUpperCase()}
                    </Badge>
                 </TableCell>
                 <TableCell className="text-center">
                    {u.activo ? <Badge variant="success">Activo</Badge> : <Badge variant="destructive">Bloqueado</Badge>}
                 </TableCell>
                 <TableCell className="text-right flex items-center justify-end gap-1">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(u)}>
                       <Edit className="w-4 h-4 text-[var(--body)] hover:text-[var(--primary)]" />
                    </Button>
                    {currentUserId !== u.id && (
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(u)} aria-label={`Eliminar ${u.nombre}`}>
                        <Trash2 className="w-4 h-4 text-[var(--body)] hover:text-[var(--destructive)]" />
                      </Button>
                    )}
                 </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
             <DialogTitle>{isEditMode ? 'Editar Usuario' : 'Nuevo Usuario'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
             <div className="grid grid-cols-2 gap-4">
               <div className="space-y-2">
                 <label className="text-sm font-medium">RUT</label>
                 <Input value={rut} onChange={e => setRut(e.target.value)} placeholder="Ej: 12345678" />
               </div>
               <div className="space-y-2">
                 <label className="text-sm font-medium">Contraseña {isEditMode && '(Opcional)'}</label>
                 <Input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={isEditMode ? 'Dejar en blanco para mantener' : 'Contraseña nueva'} />
               </div>
             </div>

             <div className="space-y-2">
               <label className="text-sm font-medium">Nombre Completo</label>
               <Input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Juan Pérez" />
             </div>

             <div className="grid grid-cols-2 gap-4 border-t pt-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium block">Nivel de Acceso (Rol)</label>
                  <select 
                    value={rol} 
                    onChange={e => setRol(e.target.value)}
                    className="w-full bg-[var(--card)] border rounded-md px-3 py-2 text-sm focus-visible:ring-1 focus-visible:ring-[var(--ring)] outline-none"
                    disabled={isEditMode && currentUserId === formId}
                  >
                     <option value="vendedor">Vendedor</option>
                     <option value="bodeguero">Bodeguero</option>
                     <option value="admin">Administrador</option>
                  </select>
                </div>
                {isEditMode && currentUserId !== formId && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium block">Estado de Cuenta</label>
                    <button 
                      onClick={() => setIsActive(!isActive)}
                      className={`w-full py-2 rounded-md border text-sm font-semibold transition-colors \${isActive ? 'bg-[var(--success)]/10 text-[var(--success)] border-[var(--success)]/30' : 'bg-[var(--destructive)]/10 text-[var(--destructive)] border-[var(--destructive)]/30'}`}
                    >
                      {isActive ? 'Activo (Desactivar)' : 'Bloqueado (Reactivar)'}
                    </button>
                  </div>
                )}
             </div>

          </div>
          <DialogFooter>
             <Button variant="outline" onClick={() => setIsOpen(false)}>Cancelar</Button>
             <Button onClick={handleSave}>Guardar Cambios</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


