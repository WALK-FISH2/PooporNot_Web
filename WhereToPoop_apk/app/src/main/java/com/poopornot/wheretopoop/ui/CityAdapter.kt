package com.poopornot.wheretopoop.ui

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.poopornot.wheretopoop.databinding.ItemCityBinding

class CityAdapter(
    private val onSelected: (String) -> Unit,
) : RecyclerView.Adapter<CityAdapter.CityViewHolder>() {
    private val cities = mutableListOf<String>()

    fun submitList(items: List<String>) {
        cities.clear()
        cities.addAll(items)
        notifyDataSetChanged()
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): CityViewHolder {
        return CityViewHolder(ItemCityBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: CityViewHolder, position: Int) {
        holder.bind(cities[position])
    }

    override fun getItemCount(): Int = cities.size

    inner class CityViewHolder(
        private val binding: ItemCityBinding,
    ) : RecyclerView.ViewHolder(binding.root) {
        fun bind(city: String) {
            binding.cityName.text = city
            binding.root.setOnClickListener { onSelected(city) }
        }
    }
}

