
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useData } from "@/context/data-context";
import { useAuth } from "@/context/auth-context";
import { ItemTypeEnum, ItemStatusEnum } from "@/types";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, AlertCircle, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Enhanced validation schema
const formSchema = z.object({
  name: z.string().min(2, {
    message: "Item name must be at least 2 characters.",
  }),
  description: z.string().min(10, {
    message: "Description must be at least 10 characters.",
  }),
  type: z.enum(["lost", "found"]),
  itemType: z.enum(["normal", "emergency"]),
  location: z.string().min(5, {
    message: "Location must be at least 5 characters.",
  }),
  contactInfo: z.string()
    .min(10, { message: "Phone number must be at least 10 digits." })
    .refine((val) => /^\d+$/.test(val), { message: "Phone number should contain only digits." }),
  image: z.any().optional(),
});

export function NewItemForm() {
  const [isLoading, setIsLoading] = useState(false);
  const { addItem } = useData();
  const { user } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      type: "lost",
      itemType: "normal",
      location: "",
      contactInfo: "",
    },
  });

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    setIsLoading(true);
    try {
      let imagePath: string | null = null;
      
      // Check if storage bucket exists and create it if it doesn't
      const { data: buckets } = await supabase.storage.listBuckets();
      const bucketExists = buckets?.some(bucket => bucket.name === 'items');
      
      if (!bucketExists) {
        await supabase.storage.createBucket('items', { public: true });
      }
      
      // Upload image if provided
      if (file) {
        const { data, error } = await supabase.storage
          .from('items')
          .upload(`${Date.now()}_${file.name}`, file);
      
        if (error) {
          console.error("Error uploading image:", error);
          toast.error("Failed to upload image. Please try again.");
        } else if (data) {
          const { data: publicUrlData } = supabase.storage
            .from('items')
            .getPublicUrl(data.path);
      
          imagePath = publicUrlData?.publicUrl || null;
        }
      }

      // Convert form values to match the Item interface structure
      await addItem({
        userName: user?.name || "Anonymous",
        userPhone: values.contactInfo,
        productName: values.name,
        photo: imagePath,
        place: values.location, // ✅ CORRECTED
        date: new Date().toISOString(),
        type: values.itemType,
        status: values.type === "lost" ? ItemStatusEnum.LOST : ItemStatusEnum.FOUND,
      });
            
      toast.success("Item reported successfully!");
      form.reset();
      setFile(null);
    } catch (error) {
      console.error("Error reporting item:", error);
      toast.error("Failed to report item. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="shadow-lg border-t-4 border-t-primary">
      <CardHeader className="bg-muted/40">
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Report an Item
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-6">
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid md:grid-cols-2 gap-6">
              {/* Item Name Field */}
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Item Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Name of the item" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Location Field */}
              <FormField
                control={form.control}
                name="location"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location</FormLabel>
                    <FormControl>
                      <Input placeholder="Where was it lost/found?" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Description Field */}
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detailed description of the item"
                      className="resize-none min-h-[100px]"
                      {...field}
                    />
                  </FormControl>
                  <FormDescription>
                    Include any unique features or details that might help identify the item.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            <div className="grid md:grid-cols-2 gap-6">
              {/* Item Type (Lost/Found) */}
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Report Type</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select report type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="lost">Lost Item</SelectItem>
                        <SelectItem value="found">Found Item</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              
              {/* Contact Phone Number */}
              <FormField
                control={form.control}
                name="contactInfo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Your contact phone number"
                        type="tel"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            
            {/* Emergency/Normal Radio Selection */}
            <FormField
              control={form.control}
              name="itemType"
              render={({ field }) => (
                <FormItem className="border rounded-md p-4 space-y-3">
                  <FormLabel>Priority Level</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      className="flex space-x-4"
                    >
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="normal" />
                        </FormControl>
                        <FormLabel className="font-normal">Normal</FormLabel>
                      </FormItem>
                      <FormItem className="flex items-center space-x-2 space-y-0">
                        <FormControl>
                          <RadioGroupItem value="emergency" />
                        </FormControl>
                        <FormLabel className="font-normal text-emergency flex items-center gap-1">
                          <AlertCircle className="h-4 w-4" />
                          Emergency
                        </FormLabel>
                      </FormItem>
                    </RadioGroup>
                  </FormControl>
                  <FormDescription>
                    Mark as emergency for high-value or urgently needed items.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            
            {/* Image Upload */}
            <div className="border rounded-md p-4 space-y-3">
              <Label htmlFor="image">Image Upload (Optional)</Label>
              <Input
                id="image"
                type="file"
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    setFile(e.target.files[0]);
                  } else {
                    setFile(null);
                  }
                }}
                className="bg-background"
              />
              {file && (
                <div className="mt-2 text-sm text-muted-foreground">
                  <p>Selected File: {file.name}</p>
                </div>
              )}
            </div>
            
            <Button type="submit" disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Submitting Report...
                </>
              ) : (
                "Submit Report"
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
