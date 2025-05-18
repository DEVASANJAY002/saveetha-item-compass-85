import { createContext, useContext, useState, useEffect } from "react";
import { Item, ItemPlace, ItemStatus, ItemType } from "@/types";
import { useAuth } from "./auth-context";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface DataContextType {
  items: Item[];
  loading: boolean;
  addItem: (item: Omit<Item, "id" | "userId" | "createdAt">) => Promise<void>;
  updateItemStatus: (id: string, status: ItemStatus) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  deleteItemsByFilter: (
    dateRange?: { start: string; end: string },
    type?: ItemType | "all"
  ) => Promise<void>;
  getUserItems: () => Item[];
  getEmergencyItems: () => Item[];
  getNormalItems: () => Item[];
  getItemById: (id: string) => Item | undefined;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

// Initial sample data in case Supabase data isn't loaded
const INITIAL_ITEMS: Item[] = [
  {
    id: "item1",
    userId: "2",
    userName: "Test User",
    userPhone: "9876543210",
    productName: "Water Bottle",
    photo: "https://images.unsplash.com/photo-1618160702438-9b02ab6515c9",
    place: "lost",
    date: "2023-05-15T10:30:00Z",
    type: "normal",
    status: "lost",
    createdAt: "2023-05-15T10:30:00Z",
  },
  {
    id: "item2",
    userId: "2",
    userName: "Test User",
    userPhone: "9876543210",
    productName: "Laptop",
    photo: null,
    place: "lost",
    date: "2023-05-17T14:20:00Z",
    type: "emergency",
    status: "lost",
    createdAt: "2023-05-17T14:20:00Z",
  },
  {
    id: "item3",
    userId: "1",
    userName: "Admin User",
    userPhone: "9876543211",
    productName: "Wallet",
    photo: null,
    place: "found",
    date: "2023-05-18T09:15:00Z",
    type: "normal",
    status: "found",
    createdAt: "2023-05-18T09:15:00Z",
  },
];

// Helper function to convert Supabase item to our app's Item type
const mapSupabaseItem = (item: any): Item => {
  return {
    id: item.id,
    userId: item.user_id,
    userName: item.name || 'Unknown User',
    userPhone: item.phone_number || '',
    productName: item.product_name,
    photo: item.photo_url,
    place: item.place as ItemPlace,
    date: item.date,
    type: item.type as ItemType,
    status: item.status as ItemStatus,
    createdAt: item.created_at,
  };
};

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();

  // Load items from Supabase
  const loadItems = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('items')
        .select('*')
        .order('created_at', { ascending: false });
        
      if (error) {
        throw error;
      }
      
      if (data) {
        const mappedItems = data.map(mapSupabaseItem);
        setItems(mappedItems);
      }
    } catch (error) {
      console.error("Error loading items:", error);
      toast.error("Failed to load items");
      // Fall back to sample data if Supabase fails
      setItems(INITIAL_ITEMS);
    } finally {
      setLoading(false);
    }
  };

  // Initial load of items
  useEffect(() => {
    loadItems();
  }, []);

  // Subscribe to realtime updates for items
  useEffect(() => {
    const channel = supabase
      .channel('items-changes')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'items' 
      }, () => {
        loadItems();
      })
      .subscribe();
      
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Auto cleanup items older than 30 days
  useEffect(() => {
    const cleanup = async () => {
      if (!user?.id) return;
      
      if (user.role === 'admin') {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        try {
          await supabase
            .from('items')
            .delete()
            .lt('created_at', thirtyDaysAgo.toISOString());
          
          // Refresh items after cleanup
          loadItems();
        } catch (error) {
          console.error("Auto cleanup error:", error);
        }
      }
    };
    
    // Run cleanup on mount and set interval
    if (user?.role === 'admin') {
      cleanup();
      const interval = setInterval(cleanup, 24 * 60 * 60 * 1000); // Once per day
      return () => clearInterval(interval);
    }
  }, [user]);

  const addItem = async (newItemData: Omit<Item, "id" | "userId" | "createdAt">) => {
    if (!user) {
      toast.error("You must be logged in to add an item");
      return;
    }

    setLoading(true);
    try {
      // Prepare item data for Supabase
      const itemData = {
        user_id: user.id,
        name: newItemData.userName,
        phone_number: newItemData.userPhone,
        product_name: newItemData.productName,
        photo_url: newItemData.photo,
        place: newItemData.place as string,
        date: new Date(newItemData.date).toISOString().split('T')[0], // Format as YYYY-MM-DD
        type: newItemData.type as string,
        status: newItemData.status as string,
      };

      const { data, error } = await supabase
        .from('items')
        .insert(itemData)
        .select()
        .single();
        
      if (error) {
        throw error;
      }
      
      if (data) {
        // Add to local state
        const newItem = mapSupabaseItem(data);
        setItems((prevItems) => [newItem, ...prevItems]);
        toast.success("Item added successfully");
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to add item");
    } finally {
      setLoading(false);
    }
  };

  const updateItemStatus = async (id: string, status: ItemStatus) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('items')
        .update({ status })
        .eq('id', id);
        
      if (error) {
        throw error;
      }

      // Update local state
      setItems((prevItems) =>
        prevItems.map((item) =>
          item.id === id ? { ...item, status } : item
        )
      );
      
      toast.success(`Item marked as ${status}`);
    } catch (error) {
      console.error(error);
      toast.error("Failed to update item status");
    } finally {
      setLoading(false);
    }
  };

  const deleteItem = async (id: string) => {
    setLoading(true);
    try {
      const { error } = await supabase
        .from('items')
        .delete()
        .eq('id', id);
        
      if (error) {
        throw error;
      }

      // Update local state
      setItems((prevItems) => prevItems.filter((item) => item.id !== id));
      toast.success("Item deleted successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete item");
    } finally {
      setLoading(false);
    }
  };

  const deleteItemsByFilter = async (
    dateRange?: { start: string; end: string },
    type?: ItemType | "all"
  ) => {
    if (!user || user.role !== 'admin') {
      toast.error("Only admins can perform batch deletions");
      return;
    }
    
    setLoading(true);
    try {
      let query = supabase.from('items').delete();
      
      if (dateRange) {
        query = query.gte('date', dateRange.start).lte('date', dateRange.end);
      }
      
      if (type && type !== "all") {
        query = query.eq('type', type);
      }
      
      const { error } = await query;
      
      if (error) {
        throw error;
      }

      // Refresh items after batch deletion
      await loadItems();
      toast.success("Items deleted successfully");
    } catch (error) {
      console.error(error);
      toast.error("Failed to delete items");
    } finally {
      setLoading(false);
    }
  };

  const getUserItems = () => {
    if (!user) return [];
    return items.filter((item) => item.userId === user.id);
  };

  const getEmergencyItems = () => {
    return items.filter((item) => item.type === "emergency");
  };

  const getNormalItems = () => {
    return items.filter((item) => item.type === "normal");
  };

  const getItemById = (id: string) => {
    return items.find((item) => item.id === id);
  };

  return (
    <DataContext.Provider
      value={{
        items,
        loading,
        addItem,
        updateItemStatus,
        deleteItem,
        deleteItemsByFilter,
        getUserItems,
        getEmergencyItems,
        getNormalItems,
        getItemById,
      }}
    >
      {children}
    </DataContext.Provider>
  );
}

export function useData() {
  const context = useContext(DataContext);
  if (context === undefined) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
}
