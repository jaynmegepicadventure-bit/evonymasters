insert into items (id,name,category) values
('wood','Wood','Resources'),('food','Food','Resources'),('stone','Stone','Resources'),('ore','Ore','Resources'),
('refining-stone','Refining Stone','Materials'),('speedup','Speedup','Speedups'),('gem','Gem','Currency')
on conflict (id) do update set name=excluded.name, category=excluded.category;
