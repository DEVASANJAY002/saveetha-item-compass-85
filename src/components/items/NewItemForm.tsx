
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { ItemPlace, ItemType, ItemStatus } from "@/types";
import { useData } from "@/context/data-context";
import { useAuth } from "@/context/auth-context";
import { toast } from "sonner";
import { AlertTriangle, Calendar as CalendarIcon, Loader2 } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

export function NewItemForm() {
  const { user } = useAuth();
  const { addItem } = useData();
  const navigate = useNavigate();
  
  const [productName, setProductName] = useState("");
  const [userPhone, setUserPhone] = useState("");
  const [place, setPlace] = useState<ItemPlace>("lost");
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [type, setType] = useState<ItemType>("normal");
  const [status, setStatus] = useState<ItemStatus>("lost");
  const [photo, setPhoto] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error("You must be logged in to report an item");
      navigate("/login");
      return;
    }

    if (!selectedDate) {
      toast.error("Please select a date");
      return;
    }

    setLoading(true);
    try {
      // Upload image if one is selected but not yet uploaded
      let finalPhotoUrl = photo;
      if (imageFile && !photo) {
        finalPhotoUrl = await uploadImage(imageFile);
      }

      await addItem({
        userName: user.name,
        userPhone,
        productName,
        photo: finalPhotoUrl,
        place,
        date: selectedDate.toISOString(),
        type,
        status,
      });
      
      toast.success("Item reported successfully");
      navigate("/");
    } catch (error) {
      console.error("Error adding item:", error);
      toast.error("Failed to report item");
    } finally {
      setLoading(false);
    }
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Store the file for later upload during form submission
    setImageFile(file);
    
    // Create a preview
    const objectUrl = URL.createObjectURL(file);
    setPhoto(objectUrl);
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    if (!user) return null;
    
    setUploading(true);
    try {
      // Create a unique file path
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2)}-${Date.now()}.${fileExt}`;
      const filePath = `${user.id}/${fileName}`;
      
      // Upload to Supabase Storage
      let { data, error } = await supabase.storage
        .from('items')
        .upload(filePath, file);
        
      // Create the bucket if it doesn't exist yet
      if (error && error.message.includes('The resource was not found')) {
        try {
          // Using custom RPC or direct SQL to create bucket since the RPC name in the original was incorrect
          await supabase.rpc('create_bucket', { name: 'items', public: true });
          
          // Try the upload again
          const retryResult = await supabase.storage
            .from('items')
            .upload(filePath, file);
            
          data = retryResult.data;
          error = retryResult.error;
        } catch (bucketError) {
          console.error('Error creating bucket:', bucketError);
          throw bucketError;
        }
      }
      
      if (error) {
        throw error;
      }
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('items')
        .getPublicUrl(filePath);
        
      return publicUrl;
    } catch (error) {
      console.error('Error uploading image: ', error);
      toast.error('Error uploading image. Please try again.');
      return null;
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Report Lost or Found Item</CardTitle>
        <CardDescription>Provide details about the item you lost or found</CardDescription>
      </CardHeader>
      <form onSubmit={handleSubmit}>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="productName">Item Name</Label>
            <Input
              id="productName"
              placeholder="e.g., Water Bottle, Wallet, Keys"
              value={productName}
              onChange={(e) => setProductName(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="userPhone">Phone Number</Label>
            <Input
              id="userPhone"
              type="tel"
              placeholder="Your contact number"
              value={userPhone}
              onChange={(e) => setUserPhone(e.target.value)}
              required
            />
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="place">Report Type</Label>
            <RadioGroup
              value={place}
              onValueChange={(value) => {
                setPlace(value as ItemPlace);
                setStatus(value as ItemStatus); // Set status based on place
              }}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="lost" id="lost" />
                <Label htmlFor="lost">Lost Item</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="found" id="found" />
                <Label htmlFor="found">Found Item</Label>
              </div>
            </RadioGroup>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="date">Date</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  id="date"
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !selectedDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {selectedDate ? format(selectedDate, "PPP") : <span>Pick a date</span>}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  initialFocus
                />
              </PopoverContent>
            </Popover>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="type">Priority Level</Label>
            <RadioGroup
              value={type}
              onValueChange={(value) => setType(value as ItemType)}
              className="flex flex-col gap-2 sm:flex-row"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="normal" id="normal" />
                <Label htmlFor="normal">Normal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="emergency" id="emergency" />
                <Label htmlFor="emergency" className="flex items-center gap-1">
                  <AlertTriangle className="h-4 w-4 text-destructive" />
                  Emergency
                </Label>
              </div>
            </RadioGroup>
            {type === "emergency" && (
              <p className="text-xs text-muted-foreground">
                Mark as emergency if the item is valuable or urgently needed.
              </p>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="photo">Photo (optional)</Label>
            <Input
              id="photo"
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              disabled={uploading}
            />
            {uploading && (
              <div className="flex items-center mt-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading image...
              </div>
            )}
            {photo && (
              <div className="mt-2 relative aspect-[4/3] w-full max-w-md rounded-md overflow-hidden">
                <img
                  src={photo}
                  alt="Item preview"
                  className="object-cover w-full h-full"
                />
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter>
          <Button 
            type="submit" 
            disabled={loading || uploading} 
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Report"
            )}
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
